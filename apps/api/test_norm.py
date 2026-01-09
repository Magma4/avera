from ingest.normalization import normalize_incident

test_cases = [
    "RAPE",
    "ASSAULT 3 & RELATED OFFENSES",
    "GRAND LARCENY",
    "PETIT LARCENY",
    "HARRASSMENT 2",
    "CRIMINAL MISCHIEF 4",
    "ROBBERY",
    "UNKNOWN OFFENSE"
]

print("Testing Normalization Logic:")
for t in test_cases:
    res = normalize_incident(t, 'nyc_nypd')
    print(f"'{t}' -> {res}")
