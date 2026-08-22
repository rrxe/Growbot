export default function handler(
  _req: unknown,
  res: {
    status: (code: number) => {
      json: (data: unknown) => void
    }
  }
) {
  res.status(200).json({
    ok: true,
    service: 'growbot-health',
    runtime: 'vercel'
  })
}
