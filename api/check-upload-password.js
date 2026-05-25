export default function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ ok: false });
  }

  const provided = request.body?.password;

  if (!provided || provided !== process.env.UPLOAD_PASSWORD) {
    return response.status(401).json({ ok: false });
  }

  return response.status(200).json({ ok: true });
}
