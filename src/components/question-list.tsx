import { IconCheck } from "@/components/icons";
import { pickOf } from "@/lib/tools";
import type { Question } from "@/lib/types";

import styles from "./question-list.module.css";

export function QuestionList({
  answers,
  questions,
}: {
  answers: Record<string, string> | null;
  questions: Question[];
}) {
  return (
    <div className={styles.root}>
      {questions.map((question, index) => {
        const answer = answers?.[question.question];
        const { chosen, custom } = pickOf(question, answer);

        return (
          <div className={styles.question} key={`${index}-${question.question}`}>
            {question.header && <span className={styles.chip}>{question.header}</span>}
            <p className={styles.text}>{question.question}</p>

            <ul className={`${styles.options} ${answer !== undefined ? styles.answered : ""}`}>
              {question.options.map((option) => (
                <li
                  className={`${styles.option} ${chosen.has(option.label) ? styles.chosen : ""}`}
                  key={option.label}
                >
                  {answer !== undefined && (
                    <span className={styles.mark}>{chosen.has(option.label) && <IconCheck />}</span>
                  )}
                  <span className={styles.optionText}>
                    <span className={styles.label}>{option.label}</span>
                    {option.description && (
                      <span className={styles.description}>{option.description}</span>
                    )}
                  </span>
                </li>
              ))}

              {custom !== null && (
                <li className={`${styles.option} ${styles.chosen}`}>
                  <span className={styles.mark}>
                    <IconCheck />
                  </span>
                  <span className={styles.optionText}>
                    <span className={styles.label} data-find-skip>
                      Your answer
                    </span>
                    <span className={styles.custom}>{custom}</span>
                  </span>
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
