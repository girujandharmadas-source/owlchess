import { describe, expect, it } from "vitest";
import {
  HOW_TO_PLAY_SLIDES,
  TUTORIAL_STORAGE_KEY,
  clampSlideIndex,
  hasSeenTutorial,
  markTutorialSeen,
  nextSlideIndex,
  prevSlideIndex,
} from "./HowToPlayModal";

describe("HowToPlayModal Guide Slides & State (src/components/HowToPlayModal.tsx)", () => {
  it("defines all 5 interactive visual guide slides with 3 annotated callouts each", () => {
    expect(HOW_TO_PLAY_SLIDES).toHaveLength(5);
    expect(HOW_TO_PLAY_SLIDES.map((s) => s.id)).toEqual([
      "elo-slider",
      "ai-coach",
      "eval-arrows",
      "glicko2-rating",
      "qr-friend-passport",
    ]);

    for (let i = 0; i < HOW_TO_PLAY_SLIDES.length; i++) {
      const slide = HOW_TO_PLAY_SLIDES[i];
      expect(slide.stepNumber).toBe(i + 1);
      expect(slide.title.length).toBeGreaterThan(5);
      expect(slide.subtitle.length).toBeGreaterThan(15);
      expect(slide.callouts).toHaveLength(3);
      for (const callout of slide.callouts) {
        expect(callout.badge.length).toBeGreaterThan(1);
        expect(callout.title.length).toBeGreaterThan(3);
        expect(callout.description.length).toBeGreaterThan(15);
      }
    }
  });

  it("navigates forward, backward, and clamps slide bounds cleanly", () => {
    expect(clampSlideIndex(-2)).toBe(0);
    expect(clampSlideIndex(99)).toBe(4);
    expect(prevSlideIndex(0)).toBe(0);
    expect(nextSlideIndex(0)).toBe(1);
    expect(nextSlideIndex(3)).toBe(4);
    expect(nextSlideIndex(4)).toBe(4);
    expect(prevSlideIndex(4)).toBe(3);
  });

  it("tracks first-visit tutorial state in localStorage under owlchess_seen_tutorial", () => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };

    expect(hasSeenTutorial(mockStorage)).toBe(false);
    markTutorialSeen(mockStorage);
    expect(store.get(TUTORIAL_STORAGE_KEY)).toBe("true");
    expect(hasSeenTutorial(mockStorage)).toBe(true);
  });
});
