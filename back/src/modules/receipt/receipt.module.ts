import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceiptPrint } from './entity/receipt-print.entity';
import { ReceiptPrintService } from './receipt-print.service';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';

// Leaf module, same shape as MercadoPagoModule: no controllers, imported by
// PaymentModule and UserModule to print the cash/transferencia informational
// ticket and the front-desk credentials slip.
@Module({
  imports: [TypeOrmModule.forFeature([ReceiptPrint]), MercadoPagoModule],
  providers: [ReceiptPrintService],
  exports: [ReceiptPrintService],
})
export class ReceiptModule {}
