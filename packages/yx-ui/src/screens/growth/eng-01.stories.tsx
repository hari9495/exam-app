import type { Meta, StoryObj } from '@storybook/react-vite';
import { FeedScreen } from './engage-feed';
import { CELEBRATIONS, POSTS, SPACES } from './engage-data';
import { d } from './perf-data';
import { liveFeed, liveFeedWithPosts } from './engage-live-samples';

const meta: Meta = { title: 'Screens/Engage/ENG-01 · Feed and spaces', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const SURVEY = { title: 'Monthly pulse, September 2026', closes: d(30), minutes: 3 };

export const Feed: S = { name: 'Feed (pinned, kudos, poll, celebration, event)', render: () => <FeedScreen posts={POSTS} spaces={SPACES} celebrations={CELEBRATIONS} openSurvey={SURVEY} /> };
export const SpaceFiltered: S = { name: 'Filtered to one space', render: () => <FeedScreen posts={POSTS} spaces={SPACES} celebrations={CELEBRATIONS} space="chennai" /> };
export const Spaces: S = { name: 'Spaces directory', render: () => <FeedScreen posts={POSTS} spaces={SPACES} celebrations={CELEBRATIONS} tab="spaces" /> };
export const HeldPost: S = { name: 'Author sees their post held', render: () => <FeedScreen posts={POSTS} spaces={SPACES} celebrations={CELEBRATIONS} heldNotice="It contains a word on the company’s blocked list." /> };
export const Phone: S = { name: 'Phone · Home tab', globals: PHONE, render: () => <FeedScreen device="phone" posts={POSTS} spaces={SPACES} celebrations={CELEBRATIONS} openSurvey={SURVEY} /> };
export const EmptySpace: S = { name: 'Empty space', render: () => <FeedScreen posts={POSTS} spaces={SPACES} celebrations={[]} space="cricket" /> };
export const Loading: S = { render: () => <FeedScreen posts={POSTS} spaces={SPACES} celebrations={CELEBRATIONS} state="loading" /> };
export const HrView: S = { name: 'HR · feed with announcements in the panel', render: () => <FeedScreen persona="hr" posts={POSTS} spaces={SPACES} celebrations={CELEBRATIONS} openSurvey={SURVEY} /> };
// Batch G2 item 12: company announcements for me, with acknowledgement.
export const Announcements: S = { name: 'Feed · company announcements to acknowledge', render: () => <FeedScreen live={liveFeed()} /> };
export const AnnouncementsEmpty: S = { name: 'Feed · nothing for me yet', render: () => <FeedScreen live={liveFeed({ posts: [] })} /> };
// Batch G2 item 100: my spaces, updates with likes and comments, my post waiting for approval, the directory.
export const MyFeed: S = { name: 'Feed · my spaces, updates and announcements', render: () => <FeedScreen live={liveFeedWithPosts()} /> };
export const MyDirectory: S = { name: 'Spaces directory · company spaces', render: () => <FeedScreen live={liveFeedWithPosts({ start: { tab: 'spaces' } })} /> };
export const ModeratorDirectory: S = { name: 'Spaces directory · moderator turns approval on or off', render: () => <FeedScreen live={liveFeedWithPosts({ start: { tab: 'spaces' }, onApproval: async () => undefined })} /> };
