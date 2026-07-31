"""Precise: ONLY match .mockResolvedValueOnce role mock chains, not test data."""
import os, glob

test_dir = r'C:\huakey-crm\backend\tests'
insert = b'\n        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status'

# Ordered list of (pattern, min_next_line_bytes) — patterns in priority order
patterns = [
    b'.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query',
    b'.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role',
    b'.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1, role_code: \'super_admin\' }]]); // role query',
    b'.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1, role_code: \'super_admin\' }]]);',
    b'.mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]]) // role query',
    b'.mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]]) // role',
    b'.mockResolvedValueOnce([[{ view_all: manageAll ? 1 : 0, manage_all: manageAll ? 1 : 0, role_code: roleCode }]])',
]

fixed = 0
for fpath in sorted(glob.glob(os.path.join(test_dir, '*.test.js'))):
    with open(fpath, 'rb') as fp:
        raw = fp.read()

    original_len = len(raw)
    for pat in patterns:
        # Find each occurrence and check if must_change_password already follows
        pos = 0
        while True:
            idx = raw.find(pat, pos)
            if idx < 0:
                break
            end = idx + len(pat)
            # Check next ~100 bytes for must_change_password
            peek = raw[end:end+100]
            if b'must_change_password' not in peek:
                raw = raw[:end] + insert + raw[end:]
            pos = end

    if len(raw) != original_len:
        with open(fpath, 'wb') as fp:
            fp.write(raw)
        fixed += 1
        print(f'  {os.path.basename(fpath)}')

print(f'\n{fixed} files updated')
