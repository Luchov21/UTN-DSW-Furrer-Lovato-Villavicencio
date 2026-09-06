import {
  Controller,
  Body,
  Post,
  Get,
  Param,
  Delete,
  Patch,
  Query,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SKIP_ALL_THROTTLERS } from '../../auth/auth.throttle';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile-dto';
import { AdminUpdateUserDto } from './dto/admin-update-user-dto';
import { AdminCreateUserDto } from './dto/admin-create-user-dto';
import { CredentialsSlipDto } from './dto/credentials-slip-dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { AllowIncompleteProfile } from '../../auth/decorators/allow-incomplete-profile.decorator';
import { AllowTemporaryPassword } from '../../auth/decorators/allow-temporary-password.decorator';
import { ActiveUser } from '../../common/decorators/active-user.decorator';
import type { UserActiveInterface } from '../../common/interfaces/user-active.interface';
import { Role } from '../../common/enum/role.enum';
import { ReceiptPrintService } from '../receipt/receipt-print.service';
import { MercadoPagoConfig } from '../mercadopago/mercadopago.config';

// Number('abc') is NaN, which used to travel down as a filter that silently
// matched nothing and was then dropped. An unparseable value is now simply
// absent, and the service refuses a request with no usable criterion left.
const toId = (raw?: string): number | undefined => {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

@Controller('api/v1/user')
@ApiTags('Usuarios')
// Declared at class level, so every endpoint is admin-only unless the handler
// overrides it with its own @Auth(Role.USER) (see updateMyProfile).
@Auth(Role.ADMIN)
// Not rate limited — see auth.throttle.ts.
@SkipThrottle(SKIP_ALL_THROTTLERS)
export class UserController {
  constructor(
    private userService: UserService,
    private readonly receiptPrintService: ReceiptPrintService,
    private readonly mercadoPagoConfig: MercadoPagoConfig,
  ) {}

  // Front-desk creation of a member who may have neither email nor password.
  // The older UsersDto is still used by auth.service.register (via
  // createUsers).
  @Post()
  createUser(@Body() dto: AdminCreateUserDto) {
    return this.userService.adminCreateUser(dto);
  }

  // Self-service: any authenticated user edits their own profile. A
  // method-level @Auth(Role.USER) replaces the class-level @Auth(Role.ADMIN)
  // because RolesGuard uses getAllAndOverride and the handler wins — a login
  // is still required, the admin role no longer is. @AllowIncompleteProfile
  // because a member whose Google profile came through wrong must still be
  // able to fix their name or email without being trapped by the gate.
  @Patch('me')
  @Auth(Role.USER)
  @AllowIncompleteProfile()
  @AllowTemporaryPassword()
  updateMyProfile(
    @ActiveUser() activeUser: UserActiveInterface,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(activeUser.sub, dto);
  }

  @Get()
  getUsers() {
    return this.userService.findAll();
  }

  // User search by id, DNI, email or name/surname (admin). It has to be
  // declared BEFORE '/:id' or Nest/Express reads "search" as an :id value and
  // this route is never reached.
  @Get('search')
  searchUsers(
    @Query('id') id?: string,
    @Query('dni') dni?: string,
    @Query('email') email?: string,
    @Query('name') name?: string,
    @Query('surname') surname?: string,
  ) {
    return this.userService.searchUsers({
      id: toId(id),
      dni: toId(dni),
      email,
      name,
      surname,
    });
  }

  @Get('filter/deleted')
  getUsersDeleted() {
    return this.userService.findAllDeleted();
  }

  @Get('/:id')
  getUserById(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findUser(id);
  }

  // Admin-side edit — see AdminUpdateUserDto for why this did not reuse the
  // since-deleted PUT /user, whose UsersDto demanded a password on every
  // update.
  @Patch('/:id')
  adminUpdateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.userService.adminUpdateUser(id, dto);
  }

  @Delete('/:id')
  deleteUsers(@Param('id', ParseIntPipe) id: number) {
    return this.userService.deleteUsers(id);
  }

  @Patch('/restore/:id')
  restoreUsers(@Param('id', ParseIntPipe) id: number) {
    return this.userService.restoreUsers(id);
  }

  // Prints the front-desk credentials slip on the Point terminal. The
  // password travels in the body because it is never stored in the clear —
  // the class-level @Auth(Role.ADMIN) already covers it, so no method-level
  // @Auth is added here (that would replace, not add to, the guard list).
  @Post('/:id/credentials-slip')
  async printCredentialsSlip(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CredentialsSlipDto,
  ) {
    const user = await this.userService.findUser(id);
    if (!user) {
      throw new NotFoundException(`El usuario con ID: ${id} no existe.`);
    }
    if (!this.mercadoPagoConfig.pointTerminalId) {
      return { printStatus: 'not_configured' };
    }

    const result = await this.receiptPrintService.printCredentialsSlip({
      userId: user.id,
      memberName: `${user.name} ${user.surname ?? ''}`.trim(),
      dni: user.dni ?? null,
      username: user.email,
      password: dto.password,
      planName: dto.planName,
      termLabel: dto.termLabel,
      terminalId: this.mercadoPagoConfig.pointTerminalId,
    });

    return {
      printStatus: result.status,
      ...(result.errorMessage ? { printError: result.errorMessage } : {}),
    };
  }
}
