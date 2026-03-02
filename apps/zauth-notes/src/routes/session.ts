import { Router } from "express";
import { config } from "../config.js";
import { optionalAuth, csrfTokenForRequest } from "../middleware/auth.js";
import { assuranceBadgeLabel, acrRank } from "../utils/assurance.js";

export const sessionRouter = Router();

sessionRouter.get("/api/session", optionalAuth, (req, res) => {
  if (!req.notesUser || !req.assurance || !req.notesSession) {
    res.status(401).json({
      authenticated: false,
      login_url: "/login"
    });
    return;
  }

  const assuranceOk = acrRank(req.assurance.acr) >= acrRank(config.notesRequiredAcr);
  const csrfToken = csrfTokenForRequest(req);

  res.status(200).json({
    authenticated: true,
    user: {
      id: req.notesUser.id,
      subject_id: req.notesUser.subject_id,
      email: req.notesUser.email,
      display_name: req.notesUser.display_name
    },
    assurance: {
      acr: req.assurance.acr,
      amr: req.assurance.amr,
      uid: req.assurance.uid,
      did: req.assurance.did,
      badge_label: assuranceBadgeLabel(req.assurance.acr),
      assurance_ok: assuranceOk,
      required_acr: config.notesRequiredAcr
    },
    csrf_token: csrfToken
  });
});
