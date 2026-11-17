// worker/budget.ts — 全站每日連線上限（保險絲）。整個網站只有一個實例（名稱 "global"）
// 每條牽線連線進房間前扣 1；當天用完就拒絕，隔天（UTC）重置。
import { DurableObject } from 'cloudflare:workers';

interface Usage {
  /** UTC 日期，例如 2026-11-17 */
  day: string;
  used: number;
}

export class DailyBudget extends DurableObject<Env> {
  /** 扣一次額度；回傳 false 代表今天已經用完 */
  async take(day: string, limit: number): Promise<boolean> {
    const stored = await this.ctx.storage.get<Usage>('usage');
    const usage: Usage = stored && stored.day === day ? stored : { day, used: 0 };
    if (usage.used >= limit) return false;
    usage.used += 1;
    await this.ctx.storage.put('usage', usage);
    return true;
  }
}
