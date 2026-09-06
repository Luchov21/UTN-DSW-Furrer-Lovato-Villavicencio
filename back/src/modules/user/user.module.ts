import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from './entity/users.entity';
import { ReceiptModule } from '../receipt/receipt.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';

@Module({
  imports: [TypeOrmModule.forFeature([Users]), ReceiptModule, MercadoPagoModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
