import { ApiBody } from '@nestjs/swagger';
import { Body, Query, ValidationPipe, type Type } from '@nestjs/common';
const pipe = (type: Type) =>
  new ValidationPipe({
    expectedType: type,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
export const ValidatedBody = (type: Type): ParameterDecorator => {
  const parameter = Body(pipe(type));
  return (target, propertyKey, index) => {
    parameter(target, propertyKey, index);
    if (propertyKey !== undefined)
      ApiBody({ type })(target, propertyKey, Object.getOwnPropertyDescriptor(target, propertyKey)!);
  };
};
export const ValidatedQuery = (type: Type) => Query(pipe(type));
