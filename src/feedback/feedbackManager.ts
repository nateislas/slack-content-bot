import fs from 'fs';
import path from 'path';

export interface FeedbackEntry {
    timestamp: string;
    type: 'dismiss' | 'save';
    reasons?: string[];
    comment?: string;
    originalTopic: string;
}

const FEEDBACK_FILE = path.join(process.cwd(), 'data/feedback_history.json');

export class FeedbackManager {
    private history: FeedbackEntry[] = [];

    constructor() {
        this.ensureDataDirectory();
        this.loadHistory();
    }

    private ensureDataDirectory() {
        const dir = path.dirname(FEEDBACK_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private loadHistory() {
        if (fs.existsSync(FEEDBACK_FILE)) {
            try {
                const data = fs.readFileSync(FEEDBACK_FILE, 'utf-8');
                this.history = JSON.parse(data);
            } catch (error) {
                console.error('Error loading feedback history:', error);
                this.history = [];
            }
        }
    }

    private saveHistory() {
        try {
            fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(this.history, null, 2));
        } catch (error) {
            console.error('Error saving feedback history:', error);
        }
    }

    addFeedback(entry: FeedbackEntry) {
        this.history.push(entry);
        this.saveHistory();
    }

    getRecentFeedback(limit: number = 20): FeedbackEntry[] {
        return this.history
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);
    }

    getNegativeFeedbackSummary(): string[] {
        const negatives = this.history.filter(h => h.type === 'dismiss' && (h.reasons?.length || h.comment));
        const summary: string[] = [];

        // Group common reasons
        const reasonCounts = new Map<string, number>();
        for (const entry of negatives) {
            entry.reasons?.forEach(r => {
                reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
            });
        }

        // Add top reasons
        for (const [reason, count] of reasonCounts) {
            if (count > 0) {
                summary.push(`User dislikes: ${reason} (flagged ${count} times)`);
            }
        }

        // Add recent specific comments
        const comments = negatives
            .filter(h => h.comment)
            .slice(-5) // Last 5 comments
            .map(h => `User comment on "${h.originalTopic}": "${h.comment}"`);

        summary.push(...comments);

        return summary;
    }
}

export const feedbackManager = new FeedbackManager();
