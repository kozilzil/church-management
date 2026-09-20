import { Controller, Get, Post, Patch, Inject, Req, Param, ParseUUIDPipe } from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody as Body, ValidatedQuery as Query } from '../../../platform/http/validated';
import { RegistryService } from '../application/registry.service';
import {
  RelationDto,
  MemberDto,
  ProfileDto,
  StatusChangeDto,
  ListDto,
  HouseholdDto,
  MoveDto,
  RepresentativeDto,
  OrganizationDto,
  ParentDto,
  EndDto,
  AffiliationDto,
  PositionDto,
  AppointmentDto,
  StatusDefinitionDto,
  CodeDto,
  AtDateDto,
} from './registry.dto';
@Controller('churches/:churchId')
export class RegistryController {
  constructor(@Inject(RegistryService) private readonly service: RegistryService) {}
  @Get('members') @Permission('membership.read') list(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(ListDto) q: ListDto,
  ) {
    return this.service.listMembers(r.actor, c, q);
  }
  @Post('members') @Permission('membership.write') create(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(MemberDto) d: MemberDto,
  ) {
    return this.service.createMember(r.actor, c, d);
  }
  @Get('members/:id') @Permission('membership.read') detail(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(r.actor, c, id);
  }
  @Patch('members/:id') @Permission('membership.write') update(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ProfileDto) d: ProfileDto,
  ) {
    return this.service.updateMember(r.actor, c, id, d);
  }
  @Post('members/:id/status-changes') @Permission('membership.write') status(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(StatusChangeDto) d: StatusChangeDto,
  ) {
    return this.service.changeStatus(r.actor, c, id, d);
  }
  @Get('households') @Permission('membership.read') households(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(ListDto) q: ListDto,
  ) {
    return this.service.listHouseholds(r.actor, c, q);
  }
  @Post('households') @Permission('membership.write') household(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(HouseholdDto) d: HouseholdDto,
  ) {
    return this.service.createHousehold(r.actor, c, d);
  }
  @Post('household-moves') @Permission('membership.write') move(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(MoveDto) d: MoveDto,
  ) {
    return this.service.moveHousehold(r.actor, c, d);
  }
  @Post('households/:id/representative') @Permission('membership.write') representative(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(RepresentativeDto) d: RepresentativeDto,
  ) {
    return this.service.representative(r.actor, c, id, d.memberId);
  }
  @Post('households/:id/archive') @Permission('membership.write') archive(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.archiveHousehold(r.actor, c, id);
  }
  @Get('households/:id/members') @Permission('membership.read') householdAt(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(AtDateDto) q: AtDateDto,
  ) {
    return this.service.householdAt(r.actor, c, id, q.at);
  }
  @Get('organizations') @Permission('membership.read') organizations(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(ListDto) q: ListDto,
  ) {
    return this.service.listOrganizations(r.actor, c, q);
  }
  @Post('organizations') @Permission('membership.write') organization(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(OrganizationDto) d: OrganizationDto,
  ) {
    return this.service.createOrganization(r.actor, c, d);
  }
  @Post('organizations/:id/parent') @Permission('membership.write') parent(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ParentDto) d: ParentDto,
  ) {
    return this.service.moveOrganization(r.actor, c, id, d.parentId);
  }
  @Post('organizations/:id/close') @Permission('membership.write') close(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(EndDto) d: EndDto,
  ) {
    return this.service.closeOrganization(r.actor, c, id, d.effectiveTo);
  }
  @Post('organization-memberships') @Permission('membership.write') affiliate(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(AffiliationDto) d: AffiliationDto,
  ) {
    return this.service.affiliate(r.actor, c, d);
  }
  @Post('organization-memberships/:id/end') @Permission('membership.write') endAffiliation(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(EndDto) d: EndDto,
  ) {
    return this.service.endAffiliation(r.actor, c, id, d.effectiveTo);
  }
  @Get('positions') @Permission('membership.read') positions(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(ListDto) q: ListDto,
  ) {
    return this.service.listPositions(r.actor, c, q);
  }
  @Post('positions') @Permission('membership.write') position(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(PositionDto) d: PositionDto,
  ) {
    return this.service.savePosition(r.actor, c, d);
  }
  @Patch('positions/:id') @Permission('membership.write') updatePosition(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(PositionDto) d: PositionDto,
  ) {
    return this.service.savePosition(r.actor, c, d, id);
  }
  @Post('position-appointments') @Permission('membership.write') appoint(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(AppointmentDto) d: AppointmentDto,
  ) {
    return this.service.appoint(r.actor, c, d);
  }
  @Post('position-appointments/:id/end') @Permission('membership.write') endAppointment(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(EndDto) d: EndDto,
  ) {
    return this.service.endAppointment(r.actor, c, id, d.effectiveTo);
  }
  @Get('definitions') @Permission('membership.read') definitions(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
  ) {
    return this.service.definitions(r.actor, c);
  }
  @Post('member-statuses') @Permission('identity.manage') saveStatus(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(StatusDefinitionDto) d: StatusDefinitionDto,
  ) {
    return this.service.saveStatus(r.actor, c, d);
  }
  @Post('organization-types') @Permission('identity.manage') saveType(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(CodeDto) d: CodeDto,
  ) {
    return this.service.saveOrganizationType(r.actor, c, d);
  }
  @Get('audit-events') @Permission('audit.read') audit(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(ListDto) q: ListDto,
  ) {
    return this.service.auditEvents(r.actor, c, q);
  }
  @Post('members/:id/relations') @Permission('membership.write') relation(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(RelationDto) d: RelationDto,
  ) {
    return this.service.addRelation(r.actor, c, id, d);
  }
  @Post('member-relations/:id/end') @Permission('membership.write') endRelation(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(EndDto) d: EndDto,
  ) {
    return this.service.endRelation(r.actor, c, id, d.effectiveTo);
  }
}
