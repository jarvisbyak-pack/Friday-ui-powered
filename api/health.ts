export default function handler(_req: any, res: any) {
  res.status(200).json({
    ok: true,
    service: 'friday-api',
    mode: 'web',
    timestamp: new Date().toISOString(),
  });
}
