import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { CreateShareLinkRequestDto } from './dto/create-share-link-request.dto';
import { ListShareLinksQueryDto } from './dto/list-share-links-query.dto';
import { ShareLinkResponseDto } from './dto/share-link-response.dto';
import { ShareLinksService } from './share-links.service';

@ApiTags('Share Links')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
@Controller('share-links')
export class ShareLinksController {
  constructor(private readonly shareLinksService: ShareLinksService) {}

  @Post()
  @ApiCreatedResponse({ type: ShareLinkResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload or items not present in the Drive index' })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  @ApiForbiddenResponse({ description: 'Connection lacks the drive.readonly scope' })
  @ApiConflictResponse({ description: 'Connection is not active' })
  createShareLink(
    @CurrentUserContext() user: CurrentUser,
    @Body() dto: CreateShareLinkRequestDto
  ): Promise<ShareLinkResponseDto> {
    return this.shareLinksService.createShareLink(user.id, dto);
  }

  @Get()
  @ApiOkResponse({ type: ShareLinkResponseDto, isArray: true })
  listShareLinks(
    @CurrentUserContext() user: CurrentUser,
    @Query() query: ListShareLinksQueryDto
  ): Promise<ShareLinkResponseDto[]> {
    return this.shareLinksService.listShareLinks(user.id, query.connectionId);
  }

  @Get(':shareLinkId')
  @ApiOkResponse({ type: ShareLinkResponseDto })
  @ApiNotFoundResponse({ description: 'Share link not found' })
  getShareLink(
    @CurrentUserContext() user: CurrentUser,
    @Param('shareLinkId', ParseUUIDPipe) shareLinkId: string
  ): Promise<ShareLinkResponseDto> {
    return this.shareLinksService.getShareLink(user.id, shareLinkId);
  }

  @Post(':shareLinkId/revoke')
  @ApiOkResponse({ type: ShareLinkResponseDto })
  @ApiNotFoundResponse({ description: 'Share link not found' })
  revokeShareLink(
    @CurrentUserContext() user: CurrentUser,
    @Param('shareLinkId', ParseUUIDPipe) shareLinkId: string
  ): Promise<ShareLinkResponseDto> {
    return this.shareLinksService.revokeShareLink(user.id, shareLinkId);
  }
}
