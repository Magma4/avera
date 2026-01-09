
def normalize_incident(raw_category: str, source_type: str) -> dict:
    """
    Maps raw crime descriptions to Avera normalized categories and severity (0-100).
    Returns dict with 'category', 'severity' or None if ignored.
    """
    if not raw_category:
        return None

    raw_upper = raw_category.upper()

    # Mapping for NYC NYPD
    if source_type == 'nyc_nypd':
        # High Severity
        if any(x in raw_upper for x in ['MURDER', 'HOMICIDE', 'SHOOTING']):
            return {'category': 'homicide', 'severity': 100}
        if 'RAPE' in raw_upper or 'SEXUAL' in raw_upper:
            return {'category': 'sexual_assault', 'severity': 90}
        if 'ROBBERY' in raw_upper:
            return {'category': 'robbery', 'severity': 80}
        if 'ASSAULT' in raw_upper and 'FELONY' in raw_upper:
            return {'category': 'assault_aggravated', 'severity': 70}
        if 'BURGLARY' in raw_upper:
            return {'category': 'burglary', 'severity': 60}
        if 'WEAPON' in raw_upper:
            return {'category': 'weapons', 'severity': 60}

        # Medium Severity
        # ASSAULT 3 is Misdemeanor
        if 'ASSAULT' in raw_upper:
             # Fallback for other assaults if not felony
            return {'category': 'assault_simple', 'severity': 40}

        if 'GRAND LARCENY' in raw_upper:
            return {'category': 'theft_major', 'severity': 40}
        if 'DANGEROUS DRUGS' in raw_upper:
            return {'category': 'drugs', 'severity': 30}

        # Low Severity
        if 'PETIT LARCENY' in raw_upper:
            return {'category': 'theft_minor', 'severity': 20}
        if 'HARRASSMENT' in raw_upper or 'HARASSMENT' in raw_upper: # Cover both spellings
            return {'category': 'harassment', 'severity': 20}
        if 'CRIMINAL MISCHIEF' in raw_upper: # Vandalism
            return {'category': 'vandalism', 'severity': 15}
        if 'OFFENSES AGAINST PUBLIC ORDER' in raw_upper:
            return {'category': 'public_order', 'severity': 10}

    # Default ignore
    return None
