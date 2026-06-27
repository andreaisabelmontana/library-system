import os
import sys

# Make the repo root importable so `import library` works under pytest
# regardless of the working directory.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
