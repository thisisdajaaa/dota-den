/**
 * A singleton built on first use. Containers wrap objects whose construction reads the
 * environment or opens clients, so importing a container (in a build, a route module or a
 * test) has no side effects. Property reads are forwarded to the instance; methods stay bound.
 */
export function lazy<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  const get = () => (instance ??= factory());
  return new Proxy({} as T, {
    get(_target, prop) {
      const target = get();
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has: (_target, prop) => Reflect.has(get(), prop),
  });
}
