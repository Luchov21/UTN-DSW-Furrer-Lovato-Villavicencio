import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register-dto';
import { CompleteProfileDto } from './complete-profile-dto';
import { AdminCreateUserDto } from '../../modules/user/dto/admin-create-user-dto';
import { AdminUpdateUserDto } from '../../modules/user/dto/admin-update-user-dto';

// A DNI is 7 or 8 digits. `users.dni` is a MySQL `int` column, so a value
// that reaches the DB past 99999999 overflows it and MySQL throws a driver
// error instead of a validation one (ER_WARN_DATA_OUT_OF_RANGE), which the
// caller sees as an opaque 500. These DTOs are the only place that can catch
// it before the query runs.
describe.each([
  [
    'RegisterDto',
    RegisterDto,
    {
      name: 'Rosa',
      surname: 'Gomez',
      email: 'rosa@gmail.com',
      phone: '3411234567',
      password: 'rosa1234',
    },
  ],
  ['CompleteProfileDto', CompleteProfileDto, { phone: '3411234567' }],
  [
    'AdminCreateUserDto',
    AdminCreateUserDto,
    { name: 'Rosa', surname: 'Gomez' },
  ],
  ['AdminUpdateUserDto', AdminUpdateUserDto, {}],
] as const)('%s dni range', (_name, Dto, base) => {
  it('rejects a dni too long to fit an int column', async () => {
    const dto = plainToInstance(Dto, { ...base, dni: 4044064302 });
    const errors = await validate(dto as object);
    expect(errors.some((error) => error.property === 'dni')).toBe(true);
  });

  it('rejects a dni with fewer than 7 digits', async () => {
    const dto = plainToInstance(Dto, { ...base, dni: 999999 });
    const errors = await validate(dto as object);
    expect(errors.some((error) => error.property === 'dni')).toBe(true);
  });

  it('accepts a 7-digit dni', async () => {
    const dto = plainToInstance(Dto, { ...base, dni: 1000000 });
    const errors = await validate(dto as object);
    expect(errors.some((error) => error.property === 'dni')).toBe(false);
  });

  it('accepts an 8-digit dni', async () => {
    const dto = plainToInstance(Dto, { ...base, dni: 99999999 });
    const errors = await validate(dto as object);
    expect(errors.some((error) => error.property === 'dni')).toBe(false);
  });

  it('rejects a 9-digit dni', async () => {
    const dto = plainToInstance(Dto, { ...base, dni: 100000000 });
    const errors = await validate(dto as object);
    expect(errors.some((error) => error.property === 'dni')).toBe(true);
  });
});
