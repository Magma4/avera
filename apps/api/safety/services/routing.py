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
        return ox.graph_from_bbox(
            bbox=(north + 0.01, south - 0.01, east + 0.01, west - 0.01),
            network_type='walk',
            simplify=True
        )

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

            # Optimization: Pre-fetch all RiskScores in the BBox if feasible.
            # For now, let's just iterate edges. It might be slow but it's MVP.

            # Better: Get all RiskScore objects for resolution 9 in the bbox area?
            # H3 doesn't support bbox query natively easily without polyfill.
            # Let's simple check midpoint of edge.

            # Cache of H3 scores
            h3_score_cache = {}

            for u, v, k, data in G.edges(keys=True, data=True):
                # Calculate edge midpoint
                # If geometry exists, use it. Else average u, v.
                if 'geometry' in data:
                    # Shapely geom
                    # Centroid is easy
                    midpoint = data['geometry'].centroid
                    lat, lng = midpoint.y, midpoint.x
                else:
                    node_u = G.nodes[u]
                    node_v = G.nodes[v]
                    lat = (node_u['y'] + node_v['y']) / 2
                    lng = (node_u['x'] + node_v['x']) / 2

                # Get H3 index (v4 API)
                try:
                    h3_index = h3.latlng_to_cell(lat, lng, 9)
                except AttributeError:
                     # Fallback for older h3-py versions
                    h3_index = h3.geo_to_h3(lat, lng, 9) # Use res 9 for street level granularity

                # Lookup Score
                if h3_index not in h3_score_cache:
                    # Inefficient N+1 query. FIXME: Bulk load later.
                    try:
                        rs = RiskScore.objects.filter(h3_index=h3_index).first()
                        score = rs.score if rs else 10 # Default to low risk if unknown
                    except Exception:
                        score = 10
                    h3_score_cache[h3_index] = score

                risk_score = h3_score_cache[h3_index]

                # Calculate Cost
                length = data.get('length', 10) # meters

                # Cost Function
                # safety_cost = length * (1 + (risk/100 * alpha))
                # If risk=0, cost=length.
                # If risk=100, cost=length * (1 + 5) = 6 * length
                risk_multiplier = 1 + (risk_score / 100.0) * alpha
                data['safety_weight'] = length * risk_multiplier
                data['risk_score'] = risk_score # for debug

            # 4. Run A* Shortest Path
            route = nx.shortest_path(G, orig_node, dest_node, weight='safety_weight')

            # 5. Extract Geometry
            # route_nodes is list of node IDs
            route_coords = []
            for node_id in route:
                node = G.nodes[node_id]
                route_coords.append([node['x'], node['y']]) # GeoJSON is [lng, lat]

            # 6. Calculate Stats
            total_dist = sum(nx.utils.pairwise(route)) # wait, need lengths
            # calculate total physical length
            real_length = 0
            total_risk_accum = 0
            for u, v in zip(route[:-1], route[1:]):
                # get edge data
                # MultiDiGraph, so there might be multiple edges. Get the one with min safety_weight
                edge_data = G.get_edge_data(u, v)
                # edge_data is a dict of key->data. Find the one with min safety_weight
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
