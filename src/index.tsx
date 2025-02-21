
  
    return () => {
      reset(document.documentElement, 'scrollBehavior');
    };
  }, [isOpen]);

  function onNestedOpenChange(o: boolean) {
    const scale = o ? (window.innerWidth - NESTED_DISPLACEMENT) / window.innerWidth : 1;

    const initialTranslate = o ? -NESTED_DISPLACEMENT : 0;

    if (nestedOpenChangeTimer.current) {
      window.clearTimeout(nestedOpenChangeTimer.current);
    }

    set(drawerRef.current, {
      transition: `transform ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
      transform: isVertical(direction)
        ? `scale(${scale}) translate3d(0, ${initialTranslate}px, 0)`
        : `scale(${scale}) translate3d(${initialTranslate}px, 0, 0)`,
    });

    if (!o && drawerRef.current) {
      nestedOpenChangeTimer.current = setTimeout(() => {
        const translateValue = getTranslate(drawerRef.current as HTMLElement, direction);
        set(drawerRef.current, {
          transition: 'none',
          transform: isVertical(direction)
            ? `translate3d(0, ${translateValue}px, 0)`
            : `translate3d(${translateValue}px, 0, 0)`,
        });
      }, 500);
    }
  }

  function onNestedDrag(_event: React.PointerEvent<HTMLDivElement>, percentageDragged: number) {
    if (percentageDragged < 0) return;

    const initialScale = (window.innerWidth - NESTED_DISPLACEMENT) / window.innerWidth;
    const newScale = initialScale + percentageDragged * (1 - initialScale);
    const newTranslate = -NESTED_DISPLACEMENT + percentageDragged * NESTED_DISPLACEMENT;

    set(drawerRef.current, {
      transform: isVertical(direction)
        ? `scale(${newScale}) translate3d(0, ${newTranslate}px, 0)`
        : `scale(${newScale}) translate3d(${newTranslate}px, 0, 0)`,
      transition: 'none',
    });
  }

  function onNestedRelease(_event: React.PointerEvent<HTMLDivElement>, o: boolean) {
    const dim = isVertical(direction) ? window.innerHeight : window.innerWidth;
    const scale = o ? (dim - NESTED_DISPLACEMENT) / dim : 1;
    const translate = o ? -NESTED_DISPLACEMENT : 0;

    if (o) {
      set(drawerRef.current, {
        transition: `transform ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
        transform: isVertical(direction)
          ? `scale(${scale}) translate3d(0, ${translate}px, 0)`
          : `scale(${scale}) translate3d(${translate}px, 0, 0)`,
      });
    }
  }

  React.useEffect(() => {
    if (!modal) {
      // Need to do this manually unfortunately
      window.requestAnimationFrame(() => {
        document.body.style.pointerEvents = 'auto';
      });
    }
  }, [modal]);

  return (
    <DialogPrimitive.Root
      defaultOpen={defaultOpen}
      onOpenChange={(open) => {
        if (!dismissible && !open) return;
        if (open) {
          setHasBeenOpened(true);
        } else {
          closeDrawer(true);
        }

        setIsOpen(open);
      }}
      open={isOpen}
    >
      <DrawerContext.Provider
        value={{
          activeSnapPoint,
          snapPoints,
          setActiveSnapPoint,
          drawerRef,
          overlayRef,
          onOpenChange,
          onPress,
          onRelease,
          onDrag,
          dismissible,
          shouldAnimate,
          handleOnly,
          isOpen,
          isDragging,
          shouldFade,
          closeDrawer,
          onNestedDrag,
          onNestedOpenChange,
          onNestedRelease,
          keyboardIsOpen,
          modal,
          snapPointsOffset,
          activeSnapPointIndex,
          direction,
          shouldScaleBackground,
          setBackgroundColorOnScale,
          noBodyStyles,
          container,
          autoFocus,
        }}
      >
        {children}
      </DrawerContext.Provider>
    </DialogPrimitive.Root>
  );
}

export const Overlay = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  function ({ ...rest }, ref) {
    const { overlayRef, snapPoints, onRelease, shouldFade, isOpen, modal, shouldAnimate } = useDrawerContext();
    const composedRef = useComposedRefs(ref, overlayRef);
    const hasSnapPoints = snapPoints && snapPoints.length > 0;

    // Overlay is the component that is locking scroll, removing it will unlock the scroll without having to dig into Radix's Dialog library
    if (!modal) {
      return null;
    }

    const onMouseUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => onRelease(event), [onRelease]);

    return (
      <DialogPrimitive.Overlay
        onMouseUp={onMouseUp}
        ref={composedRef}
        data-vaul-overlay=""
        data-vaul-snap-points={isOpen && hasSnapPoints ? 'true' : 'false'}
        data-vaul-snap-points-overlay={isOpen && shouldFade ? 'true' : 'false'}
        data-vaul-animate={shouldAnimate?.current ? 'true' : 'false'}
        {...rest}
      />
    );
  },
);

Overlay.displayName = 'Drawer.Overlay';

export type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>;

export const Content = React.forwardRef<HTMLDivElement, ContentProps>(function (
  { onPointerDownOutside, style, onOpenAutoFocus, ...rest },
  ref,
) {
  const {
    drawerRef,
    onPress,
    onRelease,
    onDrag,
    keyboardIsOpen,
    snapPointsOffset,
    activeSnapPointIndex,
    modal,
    isOpen,
    direction,
    snapPoints,
    container,
    handleOnly,
    shouldAnimate,
    autoFocus,
  } = useDrawerContext();
  // Needed to use transition instead of animations
  const [delayedSnapPoints, setDelayedSnapPoints] = React.useState(false);
  const composedRef = useComposedRefs(ref, drawerRef);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const lastKnownPointerEventRef = React.useRef<React.PointerEvent<HTMLDivElement> | null>(null);
  const wasBeyondThePointRef = React.useRef(false);
  const hasSnapPoints = snapPoints && snapPoints.length > 0;
  useScaleBackground();

  const isDeltaInDirection = (delta: { x: number; y: number }, direction: DrawerDirection, threshold = 0) => {
    if (wasBeyondThePointRef.current) return true;

    const deltaY = Math.abs(delta.y);
    const deltaX = Math.abs(delta.x);
    const isDeltaX = deltaX > deltaY;
    const dFactor = ['bottom', 'right'].includes(direction) ? 1 : -1;

    if (direction === 'left' || direction === 'right') {
      const isReverseDirection = delta.x * dFactor < 0;
      if (!isReverseDirection && deltaX >= 0 && deltaX <= threshold) {
        return isDeltaX;
      }
    } else {
      const isReverseDirection = delta.y * dFactor < 0;
      if (!isReverseDirection && deltaY >= 0 && deltaY <= threshold) {
        return !isDeltaX;
      }
    }

    wasBeyondThePointRef.current = true;
    return true;
  };

  React.useEffect(() => {
    if (hasSnapPoints) {
      window.requestAnimationFrame(() => {
        setDelayedSnapPoints(true);
      });
    }
  }, []);

  function handleOnPointerUp(event: React.PointerEvent<HTMLDivElement> | null) {
    pointerStartRef.current = null;
    wasBeyondThePointRef.current = false;
    onRelease(event);
  }

  return (
    <DialogPrimitive.Content
      data-vaul-drawer-direction={direction}
      data-vaul-drawer=""
      data-vaul-delayed-snap-points={delayedSnapPoints ? 'true' : 'false'}
      data-vaul-snap-points={isOpen && hasSnapPoints ? 'true' : 'false'}
      data-vaul-custom-container={container ? 'true' : 'false'}
      data-vaul-animate={shouldAnimate?.current ? 'true' : 'false'}
      {...rest}
      ref={composedRef}
      style={
        snapPointsOffset && snapPointsOffset.length > 0
          ? ({
              '--snap-point-height': `${snapPointsOffset[activeSnapPointIndex ?? 0]!}px`,
              ...style,
            } as React.CSSProperties)
          : style
      }
      onPointerDown={(event) => {
        if (handleOnly) return;
        rest.onPointerDown?.(event);
        pointerStartRef.current = { x: event.pageX, y: event.pageY };
        onPress(event);
      }}
      onOpenAutoFocus={(e) => {
        onOpenAutoFocus?.(e);

        if (!autoFocus) {
          e.preventDefault();
        }
      }}
      onPointerDownOutside={(e) => {
        onPointerDownOutside?.(e);

        if (!modal || e.defaultPrevented) {
          e.preventDefault();
          return;
        }

        if (keyboardIsOpen.current) {
          keyboardIsOpen.current = false;
        }
      }}
      onFocusOutside={(e) => {
        if (!modal) {
          e.preventDefault();
          return;
        }
      }}
      onPointerMove={(event) => {
        lastKnownPointerEventRef.current = event;
        if (handleOnly) return;
        rest.onPointerMove?.(event);
        if (!pointerStartRef.current) return;
        const yPosition = event.pageY - pointerStartRef.current.y;
        const xPosition = event.pageX - pointerStartRef.current.x;

        const swipeStartThreshold = event.pointerType === 'touch' ? 10 : 2;
        const delta = { x: xPosition, y: yPosition };

        const isAllowedToSwipe = isDeltaInDirection(delta, direction, swipeStartThreshold);
        if (isAllowedToSwipe) onDrag(event);
        else if (Math.abs(xPosition) > swipeStartThreshold || Math.abs(yPosition) > swipeStartThreshold) {
          pointerStartRef.current = null;
        }
      }}
      onPointerUp={(event) => {
        rest.onPointerUp?.(event);
        pointerStartRef.current = null;
        wasBeyondThePointRef.current = false;
        onRelease(event);
      }}
      onPointerOut={(event) => {
        rest.onPointerOut?.(event);
        handleOnPointerUp(lastKnownPointerEventRef.current);
      }}
      onContextMenu={(event) => {
        rest.onContextMenu?.(event);
        if (lastKnownPointerEventRef.current) {
          handleOnPointerUp(lastKnownPointerEventRef.current);
        }
      }}
    />
  );
});

Content.displayName = 'Drawer.Content';

export type HandleProps = React.ComponentPropsWithoutRef<'div'> & {
  preventCycle?: boolean;
};

const LONG_HANDLE_PRESS_TIMEOUT = 250;
const DOUBLE_TAP_TIMEOUT = 120;

export const Handle = React.forwardRef<HTMLDivElement, HandleProps>(function (
  { preventCycle = false, children, ...rest },
  ref,
) {
  const {
    closeDrawer,
    isDragging,
    snapPoints,
    activeSnapPoint,
    setActiveSnapPoint,
    dismissible,
    handleOnly,
    isOpen,
    onPress,
    onDrag,
  } = useDrawerContext();

  const closeTimeoutIdRef = React.useRef<number | null>(null);
  const shouldCancelInteractionRef = React.useRef(false);

  function handleStartCycle() {
    // Stop if this is the second click of a double click
    if (shouldCancelInteractionRef.current) {
      handleCancelInteraction();
      return;
    }
    window.setTimeout(() => {
      handleCycleSnapPoints();
    }, DOUBLE_TAP_TIMEOUT);
  }

  function handleCycleSnapPoints() {
    // Prevent accidental taps while resizing drawer
    if (isDragging || preventCycle || shouldCancelInteractionRef.current) {
      handleCancelInteraction();
      return;
    }
    // Make sure to clear the timeout id if the user releases the handle before the cancel timeout
    handleCancelInteraction();

    if (!snapPoints || snapPoints.length === 0) {
      if (!dismissible) {
        closeDrawer();
      }
      return;
    }

    const isLastSnapPoint = activeSnapPoint === snapPoints[snapPoints.length - 1];

    if (isLastSnapPoint && dismissible) {
      closeDrawer();
      return;
    }

    const currentSnapIndex = snapPoints.findIndex((point) => point === activeSnapPoint);
    if (currentSnapIndex === -1) return; // activeSnapPoint not found in snapPoints
    const nextSnapPoint = snapPoints[currentSnapIndex + 1];
    setActiveSnapPoint(nextSnapPoint);
  }

  function handleStartInteraction() {
    closeTimeoutIdRef.current = window.setTimeout(() => {
      // Cancel click interaction on a long press
      shouldCancelInteractionRef.current = true;
    }, LONG_HANDLE_PRESS_TIMEOUT);
  }

  function handleCancelInteraction() {
    if (closeTimeoutIdRef.current) {
      window.clearTimeout(closeTimeoutIdRef.current);
    }
    shouldCancelInteractionRef.current = false;
  }

  return (
    <div
      onClick={handleStartCycle}
      onPointerCancel={handleCancelInteraction}
      onPointerDown={(e) => {
        if (handleOnly) onPress(e);
        handleStartInteraction();
      }}
      onPointerMove={(e) => {
        if (handleOnly) onDrag(e);
      }}
      // onPointerUp is already handled by the content component
      ref={ref}
      data-vaul-drawer-visible={isOpen ? 'true' : 'false'}
      data-vaul-handle=""
      aria-hidden="true"
      {...rest}
    >
      {/* Expand handle's hit area beyond what's visible to ensure a 44x44 tap target for touch devices */}
      <span data-vaul-handle-hitarea="" aria-hidden="true">
        {children}
      </span>
    </div>
  );
});

Handle.displayName = 'Drawer.Handle';

export function NestedRoot({ onDrag, onOpenChange, open: nestedIsOpen, ...rest }: DialogProps) {
  const { onNestedDrag, onNestedOpenChange, onNestedRelease } = useDrawerContext();

  if (!onNestedDrag) {
    throw new Error('Drawer.NestedRoot must be placed in another drawer');
  }

  return (
    <Root
      nested
      open={nestedIsOpen}
      onClose={() => {
        onNestedOpenChange(false);
      }}
      onDrag={(e, p) => {
        onNestedDrag(e, p);
        onDrag?.(e, p);
      }}
      onOpenChange={(o) => {
        if (o) {
          onNestedOpenChange(o);
        }
        onOpenChange?.(o);
      }}
      onRelease={onNestedRelease}
      {...rest}
    />
  );
}

type PortalProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>;

export function Portal(props: PortalProps) {
  const context = useDrawerContext();
  const { container = context.container, ...portalProps } = props;

  return <DialogPrimitive.Portal container={container} {...portalProps} />;
}

export const Drawer = {
  Root,
  NestedRoot,
  Content,
  Overlay,
  Trigger: DialogPrimitive.Trigger,
  Portal,
  Handle,
  Close: DialogPrimitive.Close,
  Title: DialogPrimitive.Title,
  Description: DialogPrimitive.Description,
};
