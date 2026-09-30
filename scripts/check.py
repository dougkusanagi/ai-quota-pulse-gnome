from pathlib import Path
import json, subprocess
root = Path('ai-usage@guepardosys')
json.loads((root / 'metadata.json').read_text())
for path in root.rglob('*.js'):
    subprocess.run(['node', '--input-type=module', '--check'], input=path.read_bytes(), check=True)
subprocess.run(['glib-compile-schemas', '--strict', '--dry-run', str(root / 'schemas')], check=True)
print('JavaScript syntax, metadata and schema: OK')
