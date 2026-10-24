import { Schema, type Query, type Aggregate } from 'mongoose';

/**
 * Tenant isolation safety net (NFR: "tenant isolation on every query").
 * Rejects any query whose filter does not constrain it.
 * Platform-level code (super-admin) can opt out per query with `.setOptions({ crossTenant: true })`.
 */
export const tenantField = { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true } as const;

/** Schemas using this plugin must declare `tenantId: tenantField` themselves (keeps types inferred). */
export function tenantScoped(schema: Schema) {
  if (!schema.path('tenantId')) throw new Error('tenantScoped schemas must declare tenantId');

  const ops = [
    'find', 'findOne', 'countDocuments', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
    'findOneAndUpdate', 'findOneAndDelete', 'replaceOne', 'distinct',
  ] as const;

  for (const op of ops) {
    schema.pre(op, function (this: Query<unknown, unknown>) {
      const opts = this.getOptions() as { crossTenant?: boolean };
      if (opts.crossTenant) return;
      const filter = this.getFilter() as Record<string, unknown>;
      if (!('tenantId' in filter) || filter.tenantId === undefined || filter.tenantId === null) {
        throw new Error(`Tenant isolation: ${this.model.modelName}.${op} called without tenantId`);
      }
    });
  }

  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    const opts = this.options as { crossTenant?: boolean };
    if (opts?.crossTenant) return;
    const first = this.pipeline()[0] as { $match?: Record<string, unknown> } | undefined;
    if (!first?.$match || !('tenantId' in first.$match)) {
      throw new Error('Tenant isolation: aggregate pipeline must start with $match on tenantId');
    }
  });
}
