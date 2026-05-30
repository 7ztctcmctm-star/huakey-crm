"""
生成个人日历 .ics 文件
规则：
  - 周一周二周四周六：健身（6:00-7:00）
  - 周三周五周日：休息
  - 周六额外规则：偶数日期→上班，奇数日期→放假
  - 周日：固定休息
  - 法定节假日优先：周六日碰到法定节假日以法定节假日为准
    - 法定假日期间：放假（不论周六偶数还是上班规则）
    - 调休上班日：即使周日也上班
"""
import datetime
import uuid

# ============================================================
# 法定节假日 & 调休上班日 配置
# 参考国务院公告，如需修改直接改这里
# ============================================================

# 法定假日（连续多天的假期范围）
HOLIDAY_RANGES = {
    2026: [
        # 元旦
        (datetime.date(2026, 1, 1), datetime.date(2026, 1, 3)),
        # 春节（预计2/15-2/21，请以国务院公告为准）
        (datetime.date(2026, 2, 15), datetime.date(2026, 2, 21)),
        # 清明节
        (datetime.date(2026, 4, 4), datetime.date(2026, 4, 6)),
        # 劳动节
        (datetime.date(2026, 5, 1), datetime.date(2026, 5, 5)),
        # 端午节
        (datetime.date(2026, 5, 31), datetime.date(2026, 6, 2)),
        # 中秋节+国庆节
        (datetime.date(2026, 10, 1), datetime.date(2026, 10, 7)),
    ],
    2027: [
        # TODO: 2027年假期公布后在此添加
        # 格式：(datetime.date(2027, m, d), datetime.date(2027, m, d)),
    ],
}

# 调休上班日（周末补班日）
MAKEUP_WORKDAYS = {
    2026: [
        datetime.date(2026, 1, 24),   # 春节前调休上班（周六）
        datetime.date(2026, 2, 7),    # 春节前调休上班（周六）
        datetime.date(2026, 2, 22),   # 春节后调休上班（周日）
        datetime.date(2026, 4, 26),   # 劳动节前调休上班（周六）
        datetime.date(2026, 5, 9),    # 劳动节后调休上班（周六）
        datetime.date(2026, 9, 27),   # 国庆节前调休上班（周日）
        datetime.date(2026, 10, 10),  # 国庆节后调休上班（周六）
    ],
    2027: [
        # TODO: 2027年调休公布后在此添加
    ],
}


def is_holiday(date):
    """判断是否为法定假日"""
    ranges = HOLIDAY_RANGES.get(date.year, [])
    for start, end in ranges:
        if start <= date <= end:
            return True
    return False


def is_makeup_workday(date):
    """判断是否为调休上班日"""
    days = MAKEUP_WORKDAYS.get(date.year, [])
    return date in days


def get_holiday_name(date):
    """获取法定假日名称"""
    holiday_names = {
        (1, 1): '元旦',
        (2, None): '春节',
        (4, None): '清明节',
        (5, 1): '劳动节',
        (5, 31): '端午节',
        (10, 1): '国庆节',
    }
    for (m, d), name in holiday_names.items():
        if date.month == m:
            if d is None or date.day == d:
                return name
    return '法定假日'


def fold_line(line):
    """RFC 5545 折叠长行"""
    result = []
    while len(line.encode('utf-8')) > 75:
        cut = 75
        while cut > 0 and len(line[:cut].encode('utf-8')) > 75:
            cut -= 1
        result.append(line[:cut])
        line = ' ' + line[cut:]
    result.append(line)
    return '\r\n'.join(result)


def escape_text(text):
    return text.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')


def make_vevent(summary, dtstart, dtend=None, description=None):
    lines = [
        'BEGIN:VEVENT',
        f'UID:{uuid.uuid4()}',
        f'DTSTAMP:{datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")}',
    ]
    if dtend:
        lines.append(f'DTSTART:{dtstart}')
        lines.append(f'DTEND:{dtend}')
    else:
        lines.append(f'DTSTART;VALUE=DATE:{dtstart}')
    lines.append(f'SUMMARY:{escape_text(summary)}')
    if description:
        lines.append(f'DESCRIPTION:{escape_text(description)}')
    lines.append('END:VEVENT')
    return lines


def generate():
    cal_lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//MySchedule//CN',
        'CALSCALE:GREGORIAN',
        'X-WR-CALNAME:个人日程',
        'X-WR-TIMEZONE:Asia/Shanghai',
    ]

    start_date = datetime.date(2026, 1, 1)
    end_date = datetime.date(2027, 12, 31)

    current = start_date
    while current <= end_date:
        weekday = current.weekday()  # 0=Mon ... 6=Sun
        date_str = current.strftime('%Y%m%d')
        holiday = is_holiday(current)
        makeup = is_makeup_workday(current)

        if weekday == 0:  # Monday 健身
            cal_lines.extend(make_vevent(
                '💪 健身',
                f'{date_str}T060000',
                f'{date_str}T070000',
                '每周一健身'
            ))
        elif weekday == 1:  # Tuesday 健身
            cal_lines.extend(make_vevent(
                '💪 健身',
                f'{date_str}T060000',
                f'{date_str}T070000',
                '每周二健身'
            ))
        elif weekday == 2:  # Wednesday 休息
            cal_lines.extend(make_vevent('😴 休息', date_str, description='每周三休息'))
        elif weekday == 3:  # Thursday 健身
            cal_lines.extend(make_vevent(
                '💪 健身',
                f'{date_str}T060000',
                f'{date_str}T070000',
                '每周四健身'
            ))
        elif weekday == 4:  # Friday 休息
            cal_lines.extend(make_vevent('😴 休息', date_str, description='每周五休息'))

        elif weekday == 5:  # Saturday
            # 健身事件（法定假日也健身？还是放假也停？这里保留健身）
            cal_lines.extend(make_vevent(
                '💪 健身',
                f'{date_str}T060000',
                f'{date_str}T070000',
                '每周六健身'
            ))
            # 判断上班/放假：法定假日优先
            if holiday:
                name = get_holiday_name(current)
                cal_lines.extend(make_vevent(
                    f'🎉 {name}放假',
                    date_str,
                    description=f'{name}法定假日，放假'
                ))
            elif makeup:
                cal_lines.extend(make_vevent(
                    '🏢 调休上班',
                    date_str,
                    description='调休补班日，正常上班'
                ))
            elif current.day % 2 == 0:
                cal_lines.extend(make_vevent(
                    '🏢 上班',
                    date_str,
                    description=f'{current.strftime("%m月%d日")} 偶数日期上班'
                ))
            else:
                cal_lines.extend(make_vevent(
                    '🎉 放假',
                    date_str,
                    description=f'{current.strftime("%m月%d日")} 奇数日期放假'
                ))

        elif weekday == 6:  # Sunday
            if holiday:
                name = get_holiday_name(current)
                cal_lines.extend(make_vevent(
                    f'🎉 {name}放假',
                    date_str,
                    description=f'{name}法定假日，放假'
                ))
            elif makeup:
                # 调休上班日：即使周日也上班
                cal_lines.extend(make_vevent(
                    '🏢 调休上班',
                    date_str,
                    description='调休补班日，正常上班'
                ))
            else:
                cal_lines.extend(make_vevent(
                    '😴 休息',
                    date_str,
                    description='固定周日休息'
                ))

        current += datetime.timedelta(days=1)

    cal_lines.append('END:VCALENDAR')

    # 折叠长行并写入
    output_lines = []
    for line in cal_lines:
        output_lines.append(fold_line(line))

    content = '\r\n'.join(output_lines) + '\r\n'

    output_path = r'c:\huakey-crm\my_schedule.ics'
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)

    # 统计
    total_days = (end_date - start_date).days + 1
    print(f'已生成: {output_path}')
    print(f'时间范围: {start_date} ~ {end_date} ({total_days}天)')
    print(f'共生成 {len(cal_lines) - 6} 个事件')
    print()

    # 打印2026年周六汇总
    print('=== 2026年周六安排 ===')
    d = datetime.date(2026, 1, 1)
    while d <= datetime.date(2026, 12, 31):
        if d.weekday() == 5:
            if is_holiday(d):
                tag = f'🎉 法定假日({get_holiday_name(d)})'
            elif is_makeup_workday(d):
                tag = '🏢 调休上班'
            elif d.day % 2 == 0:
                tag = '🏢 偶数上班'
            else:
                tag = '🎉 奇数放假'
            print(f'  {d} {d.day:2d}日 {tag}')
        d += datetime.timedelta(days=1)

    # 打印2026年调休上班日
    print()
    print('=== 2026年调休上班日（周末补班） ===')
    for md in sorted(MAKEUP_WORKDAYS.get(2026, [])):
        day_names = ['一', '二', '三', '四', '五', '六', '日']
        print(f'  {md} 周{day_names[md.weekday()]} 上班')


if __name__ == '__main__':
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    generate()
