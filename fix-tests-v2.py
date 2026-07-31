"""Fix ALL test mocks: add must_change_password mock after every view_all role query mock."""
import os, glob

root = os.getcwd()
insert_line = '        .mockResolvedValueOnce([[{ must_change_password: 0 }]]) // user status\n'

# Multiple patterns to match role query mocks
patterns = [
    '.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role query',
    '.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]) // role',
    '.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role query',
    '.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1 }]]); // role',
    '.mockResolvedValueOnce([[{ view_all: 1, manage_all: 1, role_code:',
    '.mockResolvedValueOnce([[{ id: 1, username:',
    '.mockResolvedValueOnce([[{ view_all: 0, manage_all: 0 }]]) // role',
    '.mockResolvedValueOnce([[{ view_all: manageAll ? 1 : 0, manage_all: manageAll ? 1 : 0, role_code: roleCode }]])',
]

fixed = 0
test_dir = r'C:\huakey-crm\backend\tests'
for f in sorted(glob.glob(os.path.join(test_dir, '*.test.js'))):
    with open(f, 'rb') as fp:
        raw = fp.read()

    original = raw
    for pattern in patterns:
        pattern_bytes = pattern.encode('utf-8')
        insert_bytes = insert_line.encode('utf-8')

        # Only add if must_change_password is NOT already on the next line
        parts = raw.split(pattern_bytes)
        if len(parts) <= 1:
            continue

        new_parts = [parts[0]]
        for i, part in enumerate(parts[1:], 1):
            new_parts.append(pattern_bytes)
            # Check if next line already has must_change_password
            next_line_start = part.find(b'\n')
            if next_line_start >= 0:
                next_line = part[:next_line_start]
                if b'must_change_password' not in next_line:
                    new_parts.append(b'\n' + insert_bytes)
            else:
                if b'must_change_password' not in part:
                    new_parts.append(b'\n' + insert_bytes)
            new_parts.append(part)

        raw = b''.join(new_parts)

    if raw != original:
        with open(f, 'wb') as fp:
            fp.write(raw)
        fixed += 1
        print(f'  {os.path.basename(f)}')

print(f'\nFixed {fixed} files')
