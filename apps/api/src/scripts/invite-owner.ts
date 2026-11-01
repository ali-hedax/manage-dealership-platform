import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppModule } from '../app.module';
import { EmailAuthService } from '../auth/email-auth.service';
import { loadConfig } from '../config';
import {writeFileSync} from 'node:fs';

async function main() {
  const email=z.email().parse(process.argv[2]?.trim().toLowerCase());
  const app=await NestFactory.createApplicationContext(AppModule.forRoot(loadConfig()),{logger:false});
  try {
    const result=await app.get(EmailAuthService).bootstrapOwner(email);
    writeFileSync(process.env.INVITE_OUTPUT_FILE??'/private/owner-invite.txt',result.invitationUrl+'\n',{mode:0o600});
    console.log('Owner invitation saved in the private output file.');
  }
  finally {await app.close();}
}
main().catch(()=>{console.error('Owner invitation failed. Check private output path and existing owner status.');process.exitCode=1;});
