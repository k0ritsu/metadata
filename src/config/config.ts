import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const Config = Type.Object({
  APP_NAME: Type.String(),
  APP_VERSION: Type.String(),
  HTTP_PORT: Type.Number({
    default: 3000
  }),
  HTTP_VERSION: Type.Union([Type.Literal('http1.1'), Type.Literal('http2')], {
    default: 'http1.1'
  }),
  TLS_CERT_PATH: Type.Optional(Type.String()),
  TLS_KEY_PATH: Type.Optional(Type.String()),
  USE_PARALLELISM: Type.Boolean({
    default: true
  }),
  LOG_LEVEL: Type.Union(
    [Type.Literal('debug'), Type.Literal('info'), Type.Literal('warn'), Type.Literal('error')],
    {
      default: 'info'
    }
  )
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  return Value.Parse(Config, process.env);
}
