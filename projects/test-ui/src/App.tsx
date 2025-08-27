import { useState } from 'react'
import { main,stop,add } from "test-rush-core"
import { Button } from "antd"
function App() {
  const [count, setCount] = useState(0)
  const click = () => {
    setCount((count) => count + 1);
    main();
    stop();
    add(4,9)
  }
  return (
    <>
        <button onClick={click}>
          count is {count}
        </button>
        <Button size="middle" type="primary">primary</Button>
    </>
  )
}

export default App
