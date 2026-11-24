import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import {
  AuthGuard,
  Public,
  type AuthenticatedUser,
} from "../../common/guards/auth.guard.js";
import { zodPipe } from "../../common/pipes/zod-validation.pipe.js";
import { IdentityModule } from "../identity/index.js";
import { PlatformModule } from "../platform/index.js";

import { LiveService } from "./live.service.js";
const startSchema = z.object({
  title: z.string().trim().min(1).max(80),
  mode: z.enum(["video", "voice"]),
  chatEnabled: z.boolean().default(true),
});
@Controller({ path: "live", version: "1" })
@UseGuards(AuthGuard)
export class LiveController {
  constructor(private readonly live: LiveService) {}
  @Get("rooms") @Public() list() {
    return this.live.list();
  }
  @Post("rooms") start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(startSchema)) body: z.infer<typeof startSchema>,
  ) {
    return this.live.start(user.userId, body);
  }
  @Post("rooms/:id/watch") watch(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.live.watch(id, user.userId);
  }
  @Post("token") token(
    @CurrentUser() user: AuthenticatedUser,
    @Body(
      zodPipe(
        z.object({
          roomName: z.string().regex(/^eventis-live-[0-9a-f-]{36}$/),
        }),
      ),
    )
    body: { roomName: string },
  ) {
    return this.live.token(body.roomName, user.userId);
  }
  @Delete("rooms/:id") end(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.live.end(id, user.userId);
  }
  @Post("rooms/:id/heartbeat") heartbeat(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.live.heartbeat(id, user.userId);
  }
  @Post("rooms/:id/stage") stage(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(
      zodPipe(
        z.object({
          identity: z.string(),
          action: z.enum(["accept", "invite", "remove", "block"]),
        }),
      ),
    )
    body: { identity: string; action: string },
  ) {
    return this.live.stage(id, user.userId, body.identity, body.action);
  }
}
@Module({
  imports: [IdentityModule, PlatformModule],
  controllers: [LiveController],
  providers: [LiveService],
})
export class LiveModule {}
