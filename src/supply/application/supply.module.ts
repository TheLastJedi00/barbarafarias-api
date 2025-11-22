import { Module } from "@nestjs/common";
import { SupplyService } from "./supply.service";
import { SupplyFirestoreRepository } from "../infrastructure/supply.repository";
import { SupplyController } from "./supply.controller";

@Module(
    {
    imports: [],
    controllers: [ SupplyController ],
    providers: [
      SupplyService,
      {
        provide: 'SupplyRepository',
        useClass: SupplyFirestoreRepository,
      },
    ],
  }
)
export class SupplyModule {}