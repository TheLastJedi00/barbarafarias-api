import { registerDecorator, ValidationOptions } from 'class-validator';
import { IsEmailUnique as validator } from '../validators/IsEmailUnique.constraint';

export function IsEmailUnique(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: validator,
    });
  };
}
