import { IconCheck } from "@/components/icons";
import type { Todo } from "@/lib/tools";

import styles from "./todo-list.module.css";

export function TodoList({ todos }: { todos: Todo[] }) {
  const done = todos.filter((todo) => todo.status === "completed").length;
  const percent = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;

  return (
    <div className={styles.root}>
      <div
        aria-label={`${done} of ${todos.length} done`}
        aria-valuemax={todos.length}
        aria-valuemin={0}
        aria-valuenow={done}
        className={styles.track}
        role="progressbar"
      >
        <span className={styles.fill} style={{ width: `${percent}%` }} />
      </div>

      <ul className={styles.list}>
        {todos.map((todo, index) => (
          <li
            className={[
              styles.item,
              todo.status === "completed" ? styles.done : "",
              todo.status === "in_progress" ? styles.active : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={`${index}-${todo.content}`}
          >
            <span className={styles.mark}>
              {todo.status === "completed" ? <IconCheck /> : <span className={styles.ring} />}
            </span>
            <span className={styles.text}>{todo.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
