export function errorHandler(err, req, res, next) {
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
