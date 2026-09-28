"""
timetable_samples.py

Small CSV strings used by the timetable tests. Kept as strings rather
than as committed .csv files so the tests are self-contained and it's
obvious what data they exercise.

Each sample is a complete CSV with a header row and one or more data
rows.
"""

# A minimal, valid CSV: one program, one year, two entries on Monday.
SIMPLE_WEEK = """program,year,academic_year,semester,day,start_time,end_time,module_code,module_name,lecturer,venue,cross_cutting
Diploma in Electrical and Electronic Engineering,1,2025-2026,1,Monday,07:30,08:15,EP 6111,Electrical Workshop Technology I,Mwampulo A,EW,no
Diploma in Electrical and Electronic Engineering,1,2025-2026,1,Monday,09:55,10:40,EP 6101,Basics Of Electrical Engineering,Ntahumbwa L,A-103,no
"""

# Two years of the same program. Tests that program-years are created
# independently.
TWO_YEARS = """program,year,academic_year,semester,day,start_time,end_time,module_code,module_name,lecturer,venue,cross_cutting
Diploma in Electrical and Electronic Engineering,1,2025-2026,1,Monday,07:30,08:15,EP 6111,Workshop,Mwampulo A,EW,no
Diploma in Electrical and Electronic Engineering,2,2025-2026,1,Monday,07:30,08:15,EE 6205,Fundamental Of Automations,Rukanda G,A-114,no
"""

# Two programs. Tests that programs are created independently.
TWO_PROGRAMS = """program,year,academic_year,semester,day,start_time,end_time,module_code,module_name,lecturer,venue,cross_cutting
Diploma in Electrical and Electronic Engineering,1,2025-2026,1,Monday,07:30,08:15,EP 6111,Workshop,Mwampulo A,EW,no
Bachelor of Electrical and Electronic Engineering,1,2025-2026,1,Monday,07:30,08:15,EP 8101,Workshop,Mwasomi R,EW,no
"""

# Invalid: end_time is not HH:MM.
BAD_TIME = """program,year,academic_year,semester,day,start_time,end_time,module_code,module_name,lecturer,venue,cross_cutting
Diploma in Electrical and Electronic Engineering,1,2025-2026,1,Monday,07:30,8:15,EP 6111,Workshop,Mwampulo A,EW,no
"""

# Invalid: day is not a valid day name or number.
BAD_DAY = """program,year,academic_year,semester,day,start_time,end_time,module_code,module_name,lecturer,venue,cross_cutting
Diploma in Electrical and Electronic Engineering,1,2025-2026,1,Blursday,07:30,08:15,EP 6111,Workshop,Mwampulo A,EW,no
"""

# Invalid: year is not an integer.
BAD_YEAR = """program,year,academic_year,semester,day,start_time,end_time,module_code,module_name,lecturer,venue,cross_cutting
Diploma in Electrical and Electronic Engineering,first,2025-2026,1,Monday,07:30,08:15,EP 6111,Workshop,Mwampulo A,EW,no
"""

# Invalid: program column is blank.
BLANK_PROGRAM = """program,year,academic_year,semester,day,start_time,end_time,module_code,module_name,lecturer,venue,cross_cutting
,1,2025-2026,1,Monday,07:30,08:15,EP 6111,Workshop,Mwampulo A,EW,no
"""

# Invalid: missing required column.
MISSING_COLUMN = """program,year,academic_year,semester,day,start_time,module_code,module_name,lecturer,venue,cross_cutting
Diploma in Electrical and Electronic Engineering,1,2025-2026,1,Monday,07:30,EP 6111,Workshop,Mwampulo A,EW,no
"""


def write_csv(content: str, tmp_path, name="timetable.csv"):
    """Write one of the samples to a file and return its path."""
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path