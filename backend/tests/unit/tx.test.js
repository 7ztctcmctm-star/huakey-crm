/**
 * utils/tx.js 事务助手单元测试（步骤 B2 · 2026-10-19）
 *
 * 覆盖三件事：
 *   1. 传 pool ⇒ 自己拥有事务（begin / commit / rollback / release）
 *   2. 传已进入事务的连接 ⇒ 加入调用方事务（不 begin / 不 commit / 不 release）
 *      这是 opportunityService.advanceStage 能被 quoteService.approveQuote 安全复用的前提
 *   3. SAVEPOINT：子步骤失败只回滚子步骤，主事务仍可提交（ ailments - MySQL 语句级报错
 *      不会回滚整个事务，没有保存点就会把半成品落库）
 */

const { withTransaction, withSavepoint, isPool } = require('../../utils/tx');

const makeConn = () => ({
  query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn()
});

const makePool = (conn) => ({
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(conn)
});

/** 裸 mock：既无 getConnection 也无 beginTransaction（老单测就是这么写的） */
const makeBareMock = () => ({ query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) });

describe('utils/tx', () => {
  describe('isPool 判据', () => {
    it('有 getConnection 的视为连接池', () => {
      expect(isPool(makePool(makeConn()))).toBe(true);
    });
    it('只有 release 的视为已进入事务的连接', () => {
      expect(isPool(makeConn())).toBe(false);
    });
    it('空值不抛异常', () => {
      expect(isPool(null)).toBe(false);
      expect(isPool(undefined)).toBe(false);
    });
  });

  describe('withTransaction · 传 pool（拥有事务）', () => {
    it('成功路径：begin → fn → commit → release', async () => {
      const conn = makeConn();
      const pool = makePool(conn);

      const out = await withTransaction(pool, async (c) => {
        await c.query('UPDATE t SET a=1');
        return 'done';
      });

      expect(out).toBe('done');
      expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
      expect(conn.commit).toHaveBeenCalledTimes(1);
      expect(conn.rollback).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
      // fn 拿到的是连接本身，不是 pool
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('失败路径：rollback + release，且原始错误不被吞掉', async () => {
      const conn = makeConn();
      const pool = makePool(conn);
      const boom = new Error('boom');

      await expect(withTransaction(pool, async () => { throw boom; })).rejects.toBe(boom);

      expect(conn.rollback).toHaveBeenCalledTimes(1);
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('withTransaction · 传连接（加入调用方事务）', () => {
    it('不得自行 begin / commit / release', async () => {
      const conn = makeConn();

      const out = await withTransaction(conn, async (c) => {
        await c.query('UPDATE t SET a=1');
        return 'joined';
      });

      expect(out).toBe('joined');
      expect(conn.beginTransaction).not.toHaveBeenCalled();
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.release).not.toHaveBeenCalled();
    });

    it('子调用失败时也不得 commit —— 由外层决定回滚', async () => {
      const conn = makeConn();
      await expect(withTransaction(conn, async () => { throw new Error('x'); })).rejects.toThrow('x');
      expect(conn.commit).not.toHaveBeenCalled();
      expect(conn.rollback).not.toHaveBeenCalled();
    });
  });

  describe('向后兼容（裸 mock pool）', () => {
    it('既无 getConnection 也无 beginTransaction 时降级为直接执行', async () => {
      const bare = makeBareMock();
      const seen = [];
      const out = await withTransaction(bare, async (db) => {
        seen.push(db === bare);
        return 'passthrough';
      });
      expect(out).toBe('passthrough');
      expect(seen).toEqual([true]);   // 老单测的 pool 必须原样透传，否则既有断言会崩
    });
  });

  describe('withSavepoint', () => {
    it('成功：执行业务并 RELEASE SAVEPOINT', async () => {
      const conn = makeConn();
      const r = await withSavepoint(conn, 'sp_x', async () => 'ok');

      expect(r).toEqual({ ok: true, value: 'ok' });
      const sqls = conn.query.mock.calls.map((c) => String(c[0]));
      expect(sqls.some((s) => s.includes('SAVEPOINT'))).toBe(true);
      expect(sqls.some((s) => s.includes('RELEASE SAVEPOINT'))).toBe(true);
      expect(sqls.some((s) => s.includes('ROLLBACK TO SAVEPOINT'))).toBe(false);
    });

    it('失败：ROLLBACK TO SAVEPOINT 后返回 ok:false，不向上抛', async () => {
      const conn = makeConn();
      const boom = new Error('非关键失败');
      const r = await withSavepoint(conn, 'sp_y', async () => {
        await conn.query('INSERT INTO log VALUES (1)');
        throw boom;
      });

      expect(r.ok).toBe(false);
      expect(r.error).toBe(boom);
      const sqls = conn.query.mock.calls.map((c) => String(c[0]));
      expect(sqls.some((s) => s.includes('ROLLBACK TO SAVEPOINT'))).toBe(true);
      expect(sqls.indexOf('ROLLBACK TO SAVEPOINT ??')).toBeLessThan(
        sqls.lastIndexOf('RELEASE SAVEPOINT ??')
      );
    });

    it('传 pool（不是连接）时退化为普通 try/catch，不发 SAVEPOINT', async () => {
      const conn = makeConn();
      const pool = makePool(conn);
      const r = await withSavepoint(pool, 'sp_z', async () => { throw new Error('no-tx'); });

      expect(r.ok).toBe(false);
      expect(pool.query).not.toHaveBeenCalled();
      expect(conn.query).not.toHaveBeenCalled();
    });
  });
});
