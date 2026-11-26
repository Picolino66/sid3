import { Module } from '@nestjs/common';
import { ProjectConnectionsService } from './project-connections.service';
import { ProjectOverviewService } from './project-overview.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectConnectionsService, ProjectOverviewService],
  exports: [ProjectsService, ProjectConnectionsService]
})
export class ProjectsModule {}
