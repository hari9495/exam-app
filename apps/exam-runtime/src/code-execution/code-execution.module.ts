import { Module } from '@nestjs/common';
import { PistonClient } from './piston-client';
import { RunLimiter } from './run-limiter';
import { PistonRuntimesService } from './piston-runtimes.service';

@Module({
  providers: [PistonClient, RunLimiter, PistonRuntimesService],
  exports: [PistonClient, RunLimiter, PistonRuntimesService],
})
export class CodeExecutionModule {}
