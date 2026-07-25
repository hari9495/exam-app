import { act, renderHook } from '@testing-library/react';
import { useAttentionNotifications } from './useAttentionNotifications';
import { NOTIFY_REARM_MINUTES } from '../attention-alert';

type MockNotificationCtor = jest.Mock & { permission: NotificationPermission };

function mockNotificationCtor(permission: NotificationPermission = 'granted'): MockNotificationCtor {
  const ctor = jest.fn() as unknown as MockNotificationCtor;
  ctor.permission = permission;
  return ctor;
}

const roster = new Map([['a1', 'Ann']]);

describe('useAttentionNotifications', () => {
  let notificationCtor: MockNotificationCtor;

  beforeEach(() => {
    notificationCtor = mockNotificationCtor();
    (window as any).Notification = notificationCtor;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  });

  afterEach(() => {
    delete (window as any).Notification;
    jest.useRealTimers();
  });

  it('fires a notification when a new attemptId becomes flagged while visibilityState is hidden', () => {
    renderHook(({ flagged }) => useAttentionNotifications(flagged, roster, 'Midterm'), {
      initialProps: { flagged: new Set(['a1']) },
    });

    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it('fires nothing when visibilityState is visible', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    renderHook(({ flagged }) => useAttentionNotifications(flagged, roster, 'Midterm'), {
      initialProps: { flagged: new Set(['a1']) },
    });

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it('fires once per flare-up: a second render with the same attempt still flagged does not fire again', () => {
    const { rerender } = renderHook(({ flagged }) => useAttentionNotifications(flagged, roster, 'Midterm'), {
      initialProps: { flagged: new Set(['a1']) },
    });
    expect(notificationCtor).toHaveBeenCalledTimes(1);

    rerender({ flagged: new Set(['a1']) });

    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it('fires nothing when permission is denied', () => {
    notificationCtor.permission = 'denied';

    renderHook(({ flagged }) => useAttentionNotifications(flagged, roster, 'Midterm'), {
      initialProps: { flagged: new Set(['a1']) },
    });

    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("reports 'unsupported' and never throws when window.Notification is undefined", () => {
    delete (window as any).Notification;

    const { result } = renderHook(() => useAttentionNotifications(new Set(['a1']), roster, 'Midterm'));

    expect(result.current.permission).toBe('unsupported');
    expect(() => result.current.requestPermission()).not.toThrow();
  });

  it('names the candidate in the notification body', () => {
    renderHook(({ flagged }) => useAttentionNotifications(flagged, roster, 'Midterm'), {
      initialProps: { flagged: new Set(['a1']) },
    });

    expect(notificationCtor).toHaveBeenCalledWith('Midterm', expect.objectContaining({ body: expect.stringContaining('Ann') }));
  });

  describe('re-arm', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    it('does not re-notify if the attempt flares up again before the re-arm window has fully elapsed', () => {
      const { rerender } = renderHook(({ flagged }) => useAttentionNotifications(flagged, roster, 'Midterm'), {
        initialProps: { flagged: new Set(['a1']) },
      });
      expect(notificationCtor).toHaveBeenCalledTimes(1);

      // The burst subsides -- attempt drops out of the flagged set.
      rerender({ flagged: new Set<string>() });
      act(() => {
        jest.advanceTimersByTime((NOTIFY_REARM_MINUTES - 1) * 60_000);
      });
      // It flares up again, but the re-arm window hasn't fully passed yet.
      rerender({ flagged: new Set(['a1']) });

      expect(notificationCtor).toHaveBeenCalledTimes(1);
    });

    it('re-notifies once the attempt has been out of the flagged set for the full re-arm window', () => {
      const { rerender } = renderHook(({ flagged }) => useAttentionNotifications(flagged, roster, 'Midterm'), {
        initialProps: { flagged: new Set(['a1']) },
      });
      expect(notificationCtor).toHaveBeenCalledTimes(1);

      rerender({ flagged: new Set<string>() });
      act(() => {
        jest.advanceTimersByTime(NOTIFY_REARM_MINUTES * 60_000 + 1_000);
      });
      rerender({ flagged: new Set(['a1']) });

      expect(notificationCtor).toHaveBeenCalledTimes(2);
    });

    it('does not fire again for a sustained burst that never drops out of the flagged set, even past the re-arm window', () => {
      const { rerender } = renderHook(({ flagged }) => useAttentionNotifications(flagged, roster, 'Midterm'), {
        initialProps: { flagged: new Set(['a1']) },
      });
      expect(notificationCtor).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(NOTIFY_REARM_MINUTES * 60_000 + 1_000);
      });
      // Still flagged the whole time -- never dropped out, so it never re-arms.
      rerender({ flagged: new Set(['a1']) });

      expect(notificationCtor).toHaveBeenCalledTimes(1);
    });

    it('re-notifies a flare-up that occurred while the tab was visible, once hidden again past the re-arm window', () => {
      // Notify while hidden, matching the other re-arm tests' setup.
      const { rerender } = renderHook(({ flagged }) => useAttentionNotifications(flagged, roster, 'Midterm'), {
        initialProps: { flagged: new Set(['a1']) },
      });
      expect(notificationCtor).toHaveBeenCalledTimes(1);

      // Recruiter switches to looking at the page: candidate flares and settles while visible.
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      rerender({ flagged: new Set<string>() });

      act(() => {
        jest.advanceTimersByTime(NOTIFY_REARM_MINUTES * 60_000 + 1_000);
      });

      // Recruiter switches away; the same candidate flares again -- a real, separate flare-up.
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      rerender({ flagged: new Set(['a1']) });

      expect(notificationCtor).toHaveBeenCalledTimes(2);
    });
  });
});
