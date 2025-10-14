import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;
  const token = context.cookies.get("authToken");

  // If a logged-in user tries to access the login page, redirect them to the homepage.
  if (pathname.startsWith("/login") && token) {
    return context.redirect("/");
  }

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".")
  ) {
    return next();
  }

  if (!token) {
    return context.redirect("/login");
  }

  try {
    const response = await fetch(
      `${import.meta.env.PUBLIC_API_BASE_URL}/api/nodes`,
      {
        headers: {
          Authorization: `Basic ${token.value}`,
        },
      },
    );

    if (response.status === 401) {
      context.cookies.delete("authToken", { path: "/" });
      return context.redirect("/login");
    }
    return next();
  } catch (error) {
    console.error("Middleware auth check failed:", error);
    return context.redirect("/login?error=api_unavailable");
  }
});
