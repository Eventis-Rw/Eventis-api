import { type otpRequestResponse, refreshRequest } from "@eventis/contracts";
import type { z } from "zod";

// Derive aliases from the published schemas: the shared package does not export
// these names. Logout revokes a refresh-token family and accepts the same token
// shape as refresh, rather than trusting an unvalidated body.
export const logoutRequest = refreshRequest;
export type LogoutRequest = z.infer<typeof logoutRequest>;
export type RefreshRequest = z.infer<typeof refreshRequest>;
export type OtpRequestResponse = z.infer<typeof otpRequestResponse>;
