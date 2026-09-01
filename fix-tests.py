"""Fix test mocks: add must_change_password mock after role query mock."""
import os, glob

root = os.getcwd()
target = '.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query'
insert = '        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status\n'

fixed = 0
for f in sorted(glob.glob('*.test.js')):
    # Read as bytes to handle mixed encodings
    with open(f, 'rb') as fp:
        raw = fp.read()

    target_bytes = target.encode('utf-8')
    insert_bytes = insert.encode('utf-8')

    if target_bytes in raw:
        # Replace each occurrence
        new_raw = raw.replace(target_bytes, target_bytes + b'\n' + insert_bytes)
        if new_raw != raw:
            with open(f, 'wb') as fp:
                fp.write(new_raw)
            fixed += 1
            count = raw.count(target_bytes)
            print(f'  {f}: {count} occurrences')

print(f'\nFixed {fixed} files')
