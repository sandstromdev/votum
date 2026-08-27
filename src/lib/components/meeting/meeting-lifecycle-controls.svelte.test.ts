import { render } from 'vitest-browser-svelte';
import { beforeEach, expect, vi, it } from 'vitest';
import { settled } from 'svelte';
import ConfirmDialog from '#lib/components/confirm-dialog.svelte';
import { cancelConfirmDialog } from '#lib/confirm-dialog.svelte.js';
import MeetingLifecycleControls from './meeting-lifecycle-controls.svelte';
import {
	activateNextVote,
	endMeeting,
	invalidateVote,
	rerunVote,
	resolveIncompleteVote
} from '#lib/remotes/meeting.remote.js';
import type { OrganizerVote } from '#lib/vote/agenda.js';
import type { OrganizerMeeting } from '#lib/vote/meeting.js';
import type { OutcomeSnapshot } from '#lib/vote/outcome.js';

vi.mock('#lib/remotes/meeting.remote.js', () => ({
	activateNextVote: vi.fn(),
	activateVote: vi.fn(),
	closeVote: vi.fn(),
	endMeeting: vi.fn(),
	invalidateVote: vi.fn(),
	revealVote: vi.fn(),
	rerunVote: vi.fn(),
	resolveIncompleteVote: vi.fn(),
	setPublicResultBreakdown: vi.fn()
}));
vi.mock('$app/navigation', () => ({ refreshAll: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));

const meetingId = '0193e0a0-0000-7000-8000-000000000001';
const voteId = '0193e0a0-0000-7000-8000-000000000002';
const ada = { id: '0193e0a0-0000-7000-8000-000000000003', label: 'Ada', position: 0 };
const bo = { id: '0193e0a0-0000-7000-8000-000000000004', label: 'Bo', position: 1 };

const outcome = {
	voteId,
	meetingId,
	createdAt: new Date('2026-08-21T10:00:00.000Z'),
	document: {
		version: 2,
		vote: {
			kind: 'selection',
			title: 'Välj styrelse',
			selection: {
				mode: 'multiple',
				positionCount: 2,
				vacancyEnabled: false,
				options: [ada, bo]
			}
		},
		closedAt: '2026-08-21T10:00:00.000Z',
		expectedParticipantCount: 4,
		ballotCount: 3,
		counts: {
			options: [
				{ ...ada, count: 3 },
				{ ...bo, count: 2 }
			],
			vacancy: 0,
			abstention: 0
		},
		outcome: {
			kind: 'selection',
			state: 'winner',
			winner: {
				type: 'options',
				options: [ada, bo]
			}
		}
	}
} satisfies OutcomeSnapshot;

const vote = {
	id: voteId,
	meetingId,
	position: 0,
	title: 'Välj styrelse',
	lifecycle: 'closed',
	openedAt: new Date('2026-08-21T09:00:00.000Z'),
	closedAt: new Date('2026-08-21T10:00:00.000Z'),
	rerunOfVoteId: null,
	invalidationReason: null,
	invalidatedAt: null,
	revealed: true,
	revealedAt: new Date('2026-08-21T10:01:00.000Z'),
	publicResultBreakdownEnabled: false,
	outcome,
	kind: 'selection',
	selection: {
		mode: 'multiple',
		positionCount: 2,
		vacancyEnabled: false,
		options: [ada, bo]
	}
} satisfies OrganizerVote;

const meeting = {
	id: meetingId,
	lifecycle: 'open',
	revision: 4,
	agenda: [vote],
	expectedParticipantCount: 4,
	activeBallotCount: null
} satisfies Pick<
	OrganizerMeeting,
	'id' | 'lifecycle' | 'revision' | 'agenda' | 'expectedParticipantCount' | 'activeBallotCount'
>;

const activeVote = {
	...vote,
	id: '0193e0a0-0000-7000-8000-000000000005',
	position: 1,
	title: 'Nästa fråga',
	lifecycle: 'open',
	openedAt: new Date('2026-08-21T10:05:00.000Z'),
	closedAt: null,
	revealed: false,
	revealedAt: null,
	outcome: null
} satisfies OrganizerVote;

const nextDraftVote = {
	...vote,
	id: '0193e0a0-0000-7000-8000-000000000005',
	position: 1,
	title: 'Nästa fråga',
	lifecycle: 'draft',
	openedAt: null,
	closedAt: null,
	revealed: false,
	revealedAt: null,
	outcome: null
} satisfies OrganizerVote;

const incompleteVote = {
	...vote,
	revealed: false,
	revealedAt: null,
	resolution: null,
	selection: { ...vote.selection, positionCount: 3 },
	outcome: {
		...outcome,
		document: {
			...outcome.document,
			vote: {
				...outcome.document.vote,
				selection: { ...outcome.document.vote.selection, positionCount: 3 }
			},
			outcome: {
				kind: 'selection',
				state: 'incomplete',
				winner: {
					type: 'positions',
					positions: [
						{ type: 'option', id: ada.id, label: ada.label },
						{ type: 'unresolved' },
						{ type: 'unresolved' }
					]
				}
			}
		}
	}
} satisfies OrganizerVote;

beforeEach(() => {
	cancelConfirmDialog();
	vi.mocked(endMeeting).mockClear();
	vi.mocked(invalidateVote).mockClear();
	vi.mocked(rerunVote).mockClear();
	vi.mocked(resolveIncompleteVote).mockClear();
});

it('shows the Selection winner in the organiser preview', async () => {
	const screen = await render(MeetingLifecycleControls, { meeting });

	await expect.element(screen.getByText('Ada, Bo')).toBeVisible();
});

it('shows the three Incomplete-result actions and blocks Meeting ending', async () => {
	const screen = await render(MeetingLifecycleControls, {
		meeting: { ...meeting, agenda: [incompleteVote] }
	});

	await settled();

	await expect
		.element(screen.getByRole('button', { name: 'Godkänn inkomplett resultat' }))
		.toBeVisible();
	await expect
		.element(screen.getByRole('button', { name: 'Markera återstående platser som vakanta' }))
		.toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Gör om omröstningen' })).toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'Avsluta möte' })).toBeDisabled();

	await screen.getByRole('button', { name: 'Godkänn inkomplett resultat' }).click();
	await settled();
	expect(resolveIncompleteVote).toHaveBeenCalledWith({
		meetingId,
		voteId,
		resolutionType: 'accept'
	});

	await screen.getByRole('button', { name: 'Markera återstående platser som vakanta' }).click();
	await settled();
	expect(resolveIncompleteVote).toHaveBeenCalledWith({
		meetingId,
		voteId,
		resolutionType: 'vacancy'
	});

	await screen.getByRole('button', { name: 'Gör om omröstningen' }).click();
	await settled();
	expect(rerunVote).toHaveBeenCalledWith({ meetingId, voteId });
});

it('shows the selected Incomplete resolution in the organiser preview', async () => {
	const acceptedScreen = await render(MeetingLifecycleControls, {
		meeting: {
			...meeting,
			agenda: [
				{
					...incompleteVote,
					resolution: { type: 'accept', resolvedAt: '2026-08-23T10:00:00.000Z' }
				}
			]
		}
	});

	await expect.element(acceptedScreen.getByText('Ada + 2 platser ej tillsatta')).toBeVisible();

	const vacancyScreen = await render(MeetingLifecycleControls, {
		meeting: {
			...meeting,
			agenda: [
				{
					...incompleteVote,
					resolution: { type: 'vacancy', resolvedAt: '2026-08-23T10:00:00.000Z' }
				}
			]
		}
	});

	await expect.element(vacancyScreen.getByText('Ada + 2 vakanta platser')).toBeVisible();
});

it('hides the previous Vote breakdown action while another Vote is active', async () => {
	const screen = await render(MeetingLifecycleControls, {
		meeting: { ...meeting, agenda: [vote, activeVote], activeBallotCount: 1 }
	});

	await expect
		.element(screen.getByRole('button', { name: 'Visa röstfördelningen för deltagarna' }))
		.not.toBeInTheDocument();
});

it('confirms before activating next when the previous result is unrevealed', async () => {
	vi.mocked(activateNextVote).mockClear();
	await render(ConfirmDialog);
	const screen = await render(MeetingLifecycleControls, {
		meeting: {
			...meeting,
			agenda: [{ ...vote, revealed: false, revealedAt: null }, nextDraftVote]
		}
	});

	await settled();

	await screen.getByRole('button', { name: 'Aktivera nästa' }).click();
	await settled();
	await expect.element(screen.getByRole('alertdialog')).toBeVisible();
	await expect
		.element(screen.getByText('Föregående omröstning är klar. Vill du aktivera nästa ändå?'))
		.toBeVisible();
	expect(activateNextVote).not.toHaveBeenCalled();

	await screen.getByRole('button', { name: 'Avbryt' }).click();
	await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument();

	await screen.getByRole('button', { name: 'Aktivera nästa' }).click();
	await screen.getByRole('button', { name: 'Aktivera ändå' }).click();

	expect(activateNextVote).toHaveBeenCalledWith({
		meetingId,
		expectedRevision: meeting.revision
	});
});

it('ends a Meeting only after confirmation', async () => {
	await render(ConfirmDialog);
	const screen = await render(MeetingLifecycleControls, {
		meeting: { ...meeting, agenda: [] }
	});

	await screen.getByRole('button', { name: 'Avsluta möte' }).click();
	await expect.element(screen.getByRole('alertdialog')).toBeVisible();
	expect(endMeeting).not.toHaveBeenCalled();

	await screen.getByRole('alertdialog').getByRole('button', { name: 'Avbryt' }).click();
	expect(endMeeting).not.toHaveBeenCalled();

	await screen.getByRole('button', { name: 'Avsluta möte' }).click();
	await screen.getByRole('alertdialog').getByRole('button', { name: 'Avsluta' }).click();

	expect(endMeeting).toHaveBeenCalledWith({ meetingId, expectedRevision: meeting.revision });
});

it('requires a trimmed reason before invalidating a Vote', async () => {
	await render(ConfirmDialog);
	const screen = await render(MeetingLifecycleControls, {
		meeting: { ...meeting, agenda: [activeVote] }
	});

	await screen.getByRole('button', { name: 'Ogiltigförklara' }).click();
	const dialog = screen.getByRole('alertdialog');

	await dialog.getByRole('textbox', { name: 'Anledning' }).fill('  Röstningen avbröts  ');
	await dialog.getByRole('button', { name: 'Ogiltigförklara' }).click();

	expect(invalidateVote).toHaveBeenCalledWith({
		meetingId,
		voteId: activeVote.id,
		reason: 'Röstningen avbröts',
		expectedRevision: meeting.revision
	});
});
