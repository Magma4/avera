import networkx as nx
import osmnx as ox
import h3
from safety.models import RiskScore
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


# Configure OSMnx globally
# Fix for "This area is ... times your configured Overpass max query area size"
ox.settings.use_cache = True
ox.settings.log_console = False
ox.settings.max_query_area_size = 2500000000 # 2500 sq km

class RoutingService:
    def __init__(self):
        pass

    def get_graph_for_area(self, north, south, east, west):
        """Fetch walking graph for the bounding box."""
        # Add buffer to ensure we cover edge cases
        # OSMnx v2.0+ uses bbox=(west, south, east, north) or bbox=(north, south, east, west)?
        # To be safe against v1/v2 mismatches, let's just use graph_from_polygon or map accordingly.
        # But wait, looking at the error `39,154 times your configured Overpass max query area size`...
        # It means we accidentally swapped Latitude and Longitude. North/South is ~40. East/West is ~-74.
        try:
            # OSMnx < 2.0 uses (north, south, east, west)
            return ox.graph_from_bbox(north + 0.01, south - 0.01, east + 0.01, west - 0.01, network_type='walk', simplify=True)
        except TypeError:
            # OSMnx >= 2.0 uses bbox=(west, south, east, north) or bbox=(left, bottom, right, top)
            return ox.graph_from_bbox(bbox=(west - 0.01, south - 0.01, east + 0.01, north + 0.01), network_type='walk', simplify=True)

    def calculate_safer_route(self, start_lat, start_lng, end_lat, end_lng):
        """
        Calculates a route that balances distance and safety.
        Returns GeoJSON feature.
        """
        try:
            # 0. Safety Guardrail: Distance
            # Simple Euclidean approx for MVP check (or use Haversine if stricty needed)
            # 1 deg lat ~ 111km. 0.05 deg ~ 5.5km
            print(f"DEBUG: Routing Request: {start_lat},{start_lng} -> {end_lat},{end_lng}", flush=True)
            if abs(start_lat - end_lat) > 0.05 or abs(start_lng - end_lng) > 0.05:
                print(f"DEBUG: Route too long: {start_lat},{start_lng} -> {end_lat},{end_lng}", flush=True)
                return None

            # 1. Fetch Graph
            # Determine bbox with padding
            pad = 0.002 # ~200m padding
            north = max(start_lat, end_lat) + pad
            south = min(start_lat, end_lat) - pad
            east = max(start_lng, end_lng) + pad
            west = min(start_lng, end_lng) - pad

            print(f"DEBUG: Calculated BBox: N={north}, S={south}, E={east}, W={west}", flush=True)

            # Sanity Check BBox size
            if (north - south) > 0.05 or (east - west) > 0.05:
                print(f"DEBUG: BBox too large ({north-south}, {east-west}). Aborting.", flush=True)
                return None

            print(f"DEBUG: OSMnx Max Query Area: {ox.settings.max_query_area_size}", flush=True)

            # Fetch graph (this can be slow, ideally we cache this or use a local PBF in prod)
            # For this MVP, we fetch live from Overpass with caching enabled
            G = self.get_graph_for_area(north, south, east, west)
            if not G:
                return None

            # 2. Find nearest nodes
            orig_node = ox.distance.nearest_nodes(G, start_lng, start_lat)
            dest_node = ox.distance.nearest_nodes(G, end_lng, end_lat)

            # 3. Annotate Edges with Safety Weights
            # weight = length * (1 + risk_factor)
            # risk_factor = score / 100 (normalized) * alpha (tuning param)
            alpha = 5.0 # High penalty for risk.
            # If score is 100 (high risk), weight becomes length * 6.
            # If score is 0 (safe), weight is length * 1.

            # Batch fetch H3 scores? Or fetch all for bbox?
            # Fetching all scores in the bbox is efficient.
            # Get H3 cells for the bbox bounds?
            # Actually, let's just create a set of H3 tokens for every edge midpoint.

            # Optimization: Pre-fetch all RiskScores in the BBox to avoid N+1 queries.
            # Get all H3 IDs in the graph first
            required_h3s = set()
            for u, v, k, data in G.edges(keys=True, data=True):
                 if 'geometry' in data:
                     midpoint = data['geometry'].centroid
                     lat, lng = midpoint.y, midpoint.x
                 else:
                     node_u = G.nodes[u]
                     node_v = G.nodes[v]
                     lat = (node_u['y'] + node_v['y']) / 2
                     lng = (node_u['x'] + node_v['x']) / 2

                 try:
                     h3_index = h3.latlng_to_cell(lat, lng, 9)
                 except AttributeError:
                     h3_index = h3.geo_to_h3(lat, lng, 9)

                 required_h3s.add(h3_index)
                 # Tag edge with h3 to avoid re-calculating later
                 data['h3_id'] = h3_index

            # Bulk Fetch Risk Scores limit to Day/Night as well if needed (hardcoding latest for MVP)
            h3_score_cache = {}
            for rs_dict in RiskScore.objects.filter(h3_id__in=required_h3s).values('h3_id', 'score'):
                # Handle possible multiple time buckets by just taking arbitrary score for now
                if rs_dict['h3_id'] not in h3_score_cache:
                    h3_score_cache[rs_dict['h3_id']] = rs_dict['score']

             # Set Weights
            for u, v, k, data in G.edges(keys=True, data=True):
                h3_index = data.get('h3_id')
                risk_score = h3_score_cache.get(h3_index, 10) # 10 is low risk

                # Calculate Cost
                length = data.get('length', 10) # meters
                risk_multiplier = 1 + (risk_score / 100.0) * alpha
                data['safety_weight'] = length * risk_multiplier
                data['risk_score'] = risk_score # for debug

            # 4. Run A* Shortest Path
            try:
                route = nx.shortest_path(G, orig_node, dest_node, weight='safety_weight')
            except nx.NetworkXNoPath:
                print("DEBUG: No path exists between orig and dest", flush=True)
                return None

            # 5. Extract Geometry
            route_coords = []
            for node_id in route:
                node = G.nodes[node_id]
                route_coords.append([node['x'], node['y']]) # GeoJSON is [lng, lat]

            # 6. Calculate Stats
            real_length = 0
            total_risk_accum = 0

            # Use zip instead of broken nx.utils.pairwise
            for u, v in zip(route[:-1], route[1:]):
                edge_data = G.get_edge_data(u, v)
                best_key = min(edge_data, key=lambda k: edge_data[k]['safety_weight'])
                data = edge_data[best_key]
                real_length += data.get('length', 0)
                total_risk_accum += data.get('risk_score', 0) * data.get('length', 0)

            avg_risk = total_risk_accum / real_length if real_length > 0 else 0

            return {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": route_coords
                },
                "properties": {
                    "distance_meters": round(real_length),
                    "avg_risk": round(avg_risk),
                    "safety_level": "High" if avg_risk < 30 else ("Medium" if avg_risk < 60 else "Low"),
                    "explanation": [
                        f"Route avoids high-risk zones (avg risk {round(avg_risk)}/100).",
                        f"Distance: {round(real_length)} meters."
                    ]
                }
            }

        except Exception as e:
            logger.error(f"Routing failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
