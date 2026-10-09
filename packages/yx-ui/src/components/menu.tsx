import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cx } from '../lib/cx';
import { Icon, type IconComponent } from './foundations';

/** Dropdown menu: about 8 items at most, grouped with separators, destructive items last (§33). */
/** Non-modal by default so the rest of the page stays readable to assistive tech while a menu is open. */
export function Menu({ modal = false, ...rest }: ComponentPropsWithoutRef<typeof DM.Root>) {
  return <DM.Root modal={modal} {...rest} />;
}
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;

export const MenuContent = forwardRef<ElementRef<typeof DM.Content>, ComponentPropsWithoutRef<typeof DM.Content>>(
  function MenuContent({ className, sideOffset = 4, collisionPadding = 8, ...rest }, ref) {
    return (
      <DM.Portal>
        <DM.Content ref={ref} className={cx('yx-menu', className)} sideOffset={sideOffset} collisionPadding={collisionPadding} {...rest} />
      </DM.Portal>
    );
  },
);

export interface MenuItemProps extends ComponentPropsWithoutRef<typeof DM.Item> {
  icon?: IconComponent;
  /** Red, placed last, and the action must still be confirmed (§17). */
  destructive?: boolean;
  shortcut?: ReactNode;
}

export const MenuItem = forwardRef<ElementRef<typeof DM.Item>, MenuItemProps>(function MenuItem(
  { icon, destructive, shortcut, className, children, ...rest },
  ref,
) {
  return (
    <DM.Item ref={ref} className={cx('yx-menu__item', className)} data-destructive={destructive || undefined} {...rest}>
      {icon && <Icon icon={icon} />}
      <span className="yx-menu__text">{children}</span>
      {shortcut && <span className="yx-menu__shortcut">{shortcut}</span>}
    </DM.Item>
  );
});

export const MenuCheckboxItem = forwardRef<ElementRef<typeof DM.CheckboxItem>, ComponentPropsWithoutRef<typeof DM.CheckboxItem>>(
  function MenuCheckboxItem({ className, children, ...rest }, ref) {
    return (
      <DM.CheckboxItem ref={ref} className={cx('yx-menu__item', className)} {...rest}>
        <span className="yx-menu__check">
          <DM.ItemIndicator>
            <Icon icon={Check} />
          </DM.ItemIndicator>
        </span>
        <span className="yx-menu__text">{children}</span>
      </DM.CheckboxItem>
    );
  },
);

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="yx-menu__label">{children}</DM.Label>;
}

export function MenuSeparator() {
  return <DM.Separator className="yx-menu__separator" />;
}
