const EMAILJS_API = 'https://api.emailjs.com/api/v1.0/email/send'

export async function sendPasswordResetEmail(toEmail, code) {
  const res = await fetch(EMAILJS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:  process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id:     process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email:   toEmail,
        reset_code: code,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`EmailJS error ${res.status}: ${body}`)
  }
}
