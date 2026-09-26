// Runs once when the Next.js server starts. On the Node.js server (not the
// edge runtime) we start the hourly privacy clean-up.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const [{ startJanitor }, { forgetLesson }, { forgetSignals }, { forgetLessonPipeline }, { bus }] = await Promise.all([
      import("./lib/server/janitor"),
      import("./lib/server/lessons"),
      import("./lib/server/signals"),
      import("./lib/pipeline"),
      import("./lib/realtime/bus"),
    ]);
    startJanitor((id) => {
      forgetLesson(id);
      forgetSignals(id);
      forgetLessonPipeline(id);
      bus.forget(id);
    });
  }
}
