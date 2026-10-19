// Express 4 identifies error middleware by arity, so the 4th param must stay.
export function errorHandler(err, req, res, _next) {
  if (process.env.NODE_ENV === "production") {
    console.error("[error]", {
      message: err.message,
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.userId,
    });
  } else {
    console.error(err.stack);
  }
  res.status(500).json({ error: "An unexpected error occurred" });
}
