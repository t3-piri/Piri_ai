// Cloudflare binding RPC cagrilari (Vectorize, Workers AI) fetch degildir,
// AbortSignal kabul etmez — bu yuzden bir cagrinin gercekten hic
// donmemesine karsi (gozlemlenen gercek bir durum: uzun sureli wrangler
// dev oturumunda remote-binding proxy takilip cagriyi sonsuza kadar
// beklettiginde, gercek kullaniciyi sonsuz bir "yukleniyor" ekraninda
// birakirdi) genel bir Promise.race tabanli zaman asimi sarmalayicisi.

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: ${ms}ms zaman aşımı`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
