import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { AddPoolMemberRequestDto } from './dto/add-pool-member-request.dto';
import { CreateStoragePoolRequestDto } from './dto/create-storage-pool-request.dto';
import { PoolMemberResponseDto } from './dto/pool-member-response.dto';
import { StoragePoolResponseDto } from './dto/storage-pool-response.dto';
import { UpdateStoragePoolRequestDto } from './dto/update-storage-pool-request.dto';
import { StoragePoolsService } from './storage-pools.service';

@ApiTags('Storage Pools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class StoragePoolsController {
  constructor(private readonly storagePoolsService: StoragePoolsService) {}

  @Get('projects/:projectId/storage-pools')
  @ApiOkResponse({ type: StoragePoolResponseDto, isArray: true })
  @ApiUnauthorizedResponse()
  listPools(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string
  ): Promise<StoragePoolResponseDto[]> {
    return this.storagePoolsService.listPools(user.id, projectId);
  }

  @Post('projects/:projectId/storage-pools')
  @ApiCreatedResponse({ type: StoragePoolResponseDto })
  @ApiUnauthorizedResponse()
  createPool(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateStoragePoolRequestDto
  ): Promise<StoragePoolResponseDto> {
    return this.storagePoolsService.createPool(user.id, projectId, dto);
  }

  @Get('storage-pools/:poolId')
  @ApiOkResponse({ type: StoragePoolResponseDto })
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  getPool(
    @CurrentUserContext() user: CurrentUser,
    @Param('poolId') poolId: string
  ): Promise<StoragePoolResponseDto> {
    return this.storagePoolsService.getPool(user.id, poolId);
  }

  @Patch('storage-pools/:poolId')
  @ApiOkResponse({ type: StoragePoolResponseDto })
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  updatePool(
    @CurrentUserContext() user: CurrentUser,
    @Param('poolId') poolId: string,
    @Body() dto: UpdateStoragePoolRequestDto
  ): Promise<StoragePoolResponseDto> {
    return this.storagePoolsService.updatePool(user.id, poolId, dto);
  }

  @Delete('storage-pools/:poolId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  deletePool(
    @CurrentUserContext() user: CurrentUser,
    @Param('poolId') poolId: string
  ): Promise<void> {
    return this.storagePoolsService.deletePool(user.id, poolId);
  }

  @Post('storage-pools/:poolId/members')
  @ApiCreatedResponse({ type: PoolMemberResponseDto })
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  addMember(
    @CurrentUserContext() user: CurrentUser,
    @Param('poolId') poolId: string,
    @Body() dto: AddPoolMemberRequestDto
  ): Promise<PoolMemberResponseDto> {
    return this.storagePoolsService.addMember(user.id, poolId, dto);
  }

  @Delete('storage-pools/:poolId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  removeMember(
    @CurrentUserContext() user: CurrentUser,
    @Param('poolId') poolId: string,
    @Param('memberId') memberId: string
  ): Promise<void> {
    return this.storagePoolsService.removeMember(user.id, poolId, memberId);
  }
}
