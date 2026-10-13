/**
 * Open overlays (modals and popovers) in opening order. Only the top layer reacts to
 * Escape and Tab, so nested layers close one at a time and traps do not fight each other.
 */
const stack: symbol[] = [];

/** Registers a layer as the new top; call the returned function when it closes or unmounts. */
export function pushLayer(): { id: symbol; pop: () => void } {
  const id = Symbol("layer");
  stack.push(id);
  return {
    id,
    pop: () => {
      const index = stack.indexOf(id);
      if (index !== -1) stack.splice(index, 1);
    },
  };
}

export function isTopLayer(id: symbol): boolean {
  return stack[stack.length - 1] === id;
}
