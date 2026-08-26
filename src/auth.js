// ============================================================
// BERTHO AI — AUTHENTICATION LAYER
// ============================================================

const SECRET_NAME = "BERTHO_AI_SECRET";


// ============================================================
// AUTHENTICATE INTERNAL REQUEST
// ============================================================

export function authenticateRequest(request, env) {

  const expectedSecret =
    env[SECRET_NAME];

  if (
    !expectedSecret ||
    typeof expectedSecret !== "string"
  ) {
    console.error(
      "BERTHO AI AUTH: secret not configured"
    );

    return {
      authorized: false,
      reason: "server_auth_not_configured"
    };
  }


  const providedSecret =
    request.headers.get(
      "Authorization"
    );


  if (!providedSecret) {

    return {
      authorized: false,
      reason: "missing_authorization"
    };

  }


  let token =
    providedSecret;


  // Support:
  // Authorization: Bearer <secret>

  if (
    providedSecret
      .toLowerCase()
      .startsWith("bearer ")
  ) {

    token =
      providedSecret
        .slice(7)
        .trim();

  }


  if (
    !token ||
    token !== expectedSecret
  ) {

    return {
      authorized: false,
      reason: "invalid_authorization"
    };

  }


  return {
    authorized: true
  };

}


// ============================================================
// AUTHENTICATION RESPONSE
// ============================================================

export function unauthorizedResponse(
  reason = "unauthorized"
) {

  return Response.json(
    {
      success: false,
      error: "unauthorized",
      reason
    },
    {
      status: 401,
      headers: {
        "Content-Type":
          "application/json",

        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Headers":
          "Content-Type, Authorization"
      }
    }
  );

}