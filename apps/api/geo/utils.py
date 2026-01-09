import h3

def point_to_h3(lat: float, lng: float, resolution: int = 9) -> str:
    """
    Convert a lat/lng point to an H3 index.
    Resolution 9 is approx 0.1km^2 (hex edge ~174m).
    """
    return h3.latlng_to_cell(lat, lng, resolution)
