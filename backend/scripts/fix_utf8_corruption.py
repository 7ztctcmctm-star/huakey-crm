#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复因 UTF-8 尾部字节丢失导致的中文乱码（读取时用 U+FFFD 占位）。"""

from pathlib import Path

REPLACEMENTS = [
    # backend/tests/boundary.test.js
    ("describe('边界测试 - 空数据场�?, () => {", "describe('边界测试 - 空数据场景', () => {"),
    ("describe('客户 list 返回空数�?, () => {", "describe('客户 list 返回空数组', () => {"),
    ("describe('商机 list 返回空数�?, () => {", "describe('商机 list 返回空数组', () => {"),
    ("describe('合同 list 返回空数�?, () => {", "describe('合同 list 返回空数组', () => {"),
    ("describe('产品 list 返回空数�?, () => {", "describe('产品 list 返回空数组', () => {"),
    ("describe('详情接口 id 不存�?, () => {", "describe('详情接口 id 不存在', () => {"),
    ("svc.getCustomerDetail.mockRejectedValue({ code: 404, message: '客户不存�? });", "svc.getCustomerDetail.mockRejectedValue({ code: 404, message: '客户不存在' });"),
    ("describe('边界测试 - 极大值场�?, () => {", "describe('边界测试 - 极大值场景', () => {"),
    ("describe('pageSize 超大�?, () => {", "describe('pageSize 超大值', () => {"),
    ("describe('字符串字段超�?, () => {", "describe('字符串字段超长', () => {"),
    ("describe('数值字段极大�?, () => {", "describe('数值字段极大值', () => {"),
    ("describe('SQL 注入字符�?, () => {", "describe('SQL 注入字符串', () => {"),
    ("it('customer/add company_name �?SQL 注入 应通过 Joi（由数据库层防御�?, async () => {", "it('customer/add company_name 含 SQL 注入 应通过 Joi（由数据库层防御）', async () => {"),
    ("describe('XSS 字符�?, () => {", "describe('XSS 字符串', () => {"),
    ("it('customer/add company_name �?XSS 应通过（由前端转义�?, async () => {", "it('customer/add company_name 含 XSS 应通过（由前端转义）', async () => {"),
    ("describe('Emoji 字符�?, () => {", "describe('Emoji 字符串', () => {"),
    ("describe('换行符和制表�?, () => {", "describe('换行符和制表符', () => {"),
    ("describe('数值字段传字符�?, () => {", "describe('数值字段传字符串', () => {"),
    ("describe('日期字段传非法格�?, () => {", "describe('日期字段传非法格式', () => {"),
    (".send({ name: '商机', customer_id: 1, expected_date: '2026�?�?5�? });", ".send({ name: '商机', customer_id: 1, expected_date: '2026年7月5日' });"),
    ("describe('enum 字段传无效�?, () => {", "describe('enum 字段传无效值', () => {"),
    ("// �?update 来测 enum 更合适", "// 用 update 来测 enum 更合适"),

    # backend/tests/businessFlow.customer.test.js
    (".send({ customer_id: 100, content: '电话沟通需�?, follow_type: '电话' });", ".send({ customer_id: 100, content: '电话沟通需求', follow_type: '电话' });"),
    (".mockResolvedValueOnce([[{ id: 100, status: 2 }]])   // 客户校验（status=2 正式客户�?", ".mockResolvedValueOnce([[{ id: 100, status: 2 }]])   // 客户校验（status=2 正式客户）"),
    (".mockResolvedValueOnce([[{ id: 300, stage: 4 }]])                // advanceStage 查当前阶�?", ".mockResolvedValueOnce([[{ id: 300, stage: 4 }]])                // advanceStage 查当前阶段"),
    ("it('Step 7: POST /api/v1/customer/delete �?移入回收�?, async () => {", "it('Step 7: POST /api/v1/customer/delete — 移入回收站', async () => {"),

    # backend/tests/businessFlow.procurement.test.js
    ("it('Step 1: POST /api/v1/supplier/add �?创建供应�?, async () => {", "it('Step 1: POST /api/v1/supplier/add — 创建供应商', async () => {"),
    ("name: '测试供应�?,", "name: '测试供应商',"),
    ("it('Step 2: POST /api/v1/purchase/add �?创建采购�?, async () => {", "it('Step 2: POST /api/v1/purchase/add — 创建采购单', async () => {"),
    ("title: '采购原材料订�?,", "title: '采购原材料订单',"),
]


def fix_file(path: Path) -> int:
    text = path.read_text(encoding='utf-8', errors='replace')
    count = 0
    for broken, fixed in REPLACEMENTS:
        if broken in text:
            text = text.replace(broken, fixed)
            count += 1
    path.write_text(text, encoding='utf-8')
    return count


def main():
    files = [
        'backend/routes/analysis.js',
        'backend/tests/boundary.test.js',
        'backend/tests/businessFlow.customer.test.js',
        'backend/tests/businessFlow.procurement.test.js',
    ]
    total = 0
    for f in files:
        p = Path(f)
        if not p.exists():
            print(f'跳过：{f} 不存在')
            continue
        n = fix_file(p)
        total += n
        print(f'{f}: 完成 {n} 处替换')
    print(f'总计替换 {total} 处')


if __name__ == '__main__':
    main()
