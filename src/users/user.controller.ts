import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto } from './dto/CreateUser.dto';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import { FirebaseAuthGuard } from '../auth/guards/firebase.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { ResponseUserDto } from './dto/ResponseUser.dto';
import { UserService } from './user.service';

@Controller('/users')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class UserController {
  constructor(private service: UserService) {}

  @Post()
  @Roles('teacher')
  async createUser(@Body() user: CreateUserDto): Promise<ResponseUserDto> {
    return this.service.createUser(user);
  }
  @Get()
  @Roles('teacher')
  async getAll(): Promise<User[]> {
    return this.service.getAllUsers();
  }
  @Get(':id')
  async findById(@Param('id') id: string): Promise<User | null> {
    return this.service.findById(id);
  }
  @Put(':id')
  @Roles('teacher')
  async update(
    @Param('id') id: string,
    @Body() user: UpdateUserDto,
  ): Promise<User> {
    return this.service.updateUser(id, user);
  }
  @Delete(':id')
  @Roles('teacher')
  async delete(@Param('id') id: string): Promise<void> {
    return this.service.delete(id);
  }
}
